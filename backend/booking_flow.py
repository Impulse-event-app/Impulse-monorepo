"""
The one booking flow. Solo bookings, direct split bookings and Huddles (a
booking with a voting stage) all run through here once the deal is known:
price lock, shares, the deposit fan-out, the guarantor charge, the balance
fan-out at redemption, the decline handler, the refund path and the deadline
sweep. Routers own HTTP shape and auth; they never charge or refund directly.

The only fork on has_voting after resolution is at the share deadline:
a Huddle collapses and refunds (nobody guaranteed it), a direct booking falls
to its initiator's card (the initiator guaranteed it when they booked).

Nonces:
  deposit-{bookingId}-{memberId}-{attempt}   a seat's own deposit
  guarantor-{bookingId}-{memberId}           initiator covering an unpaid seat at the deadline
  balance-{bookingId}-{memberId}             balance at redemption
  refund-{bookingId}-{memberId}              Huddle collapse / cancel
`attempt` moves on after a definitive decline or a share change, because
Pinch answers a reused nonce with the first result and ignores the amount.
"""
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func as sa_func, text
from sqlalchemy.orm import Session, joinedload

import payments
import push
import wallet
from booking_logic import (
    SplitError, apply_cover, compute_shares, deal_cutoff, deposit_split, fmt_cents, recalc_unpaid, validate_custom,
)
from models import Booking, BookingParticipant, Deal, User
from payments import PaymentNotApproved
from pinch_client import PinchError

logger = logging.getLogger("impulse.booking_flow")

PINCH_MERCHANT_ID: str = os.environ["PINCH_TEST_MERCHANT_ID"]

# A seat whose deposit is settled one way or another — nothing left to collect.
DEPOSIT_DONE = ("paid", "guaranteed", "settled", "declined")
# A seat whose amount can no longer change: money has moved against it.
DEPOSIT_FIXED = ("paid", "guaranteed")


def now() -> datetime:
    return datetime.now(timezone.utc)


def touch(b: Booking) -> None:
    """Bump updated_at — the realtime poke that tells every participant to refetch."""
    b.updated_at = sa_func.now()


def cents(amount) -> int:
    return int(round(float(amount) * 100))


def slot_label(b: Booking) -> str:
    return f"{b.deal.date} {b.slot_time or ''}".strip() if b.deal else ""


def load(db: Session, booking_id: str, *, lock: bool = False) -> Booking:
    q = (
        db.query(Booking)
        .options(
            joinedload(Booking.participants),
            joinedload(Booking.deal).joinedload(Deal.venue),
        )
        .filter(Booking.id == booking_id)
    )
    if lock:
        q = q.with_for_update(of=Booking)
    b = q.first()
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


def share_order(b: Booking) -> List[BookingParticipant]:
    """Deterministic seat order for share math: initiator first (absorbs the
    rounding remainder), then everyone else by join time."""
    seats = sorted(b.participants, key=lambda p: (p.joined_at or now(), p.id))
    first = [p for p in seats if p.id == b.initiator_member_id]
    return first + [p for p in seats if p.id != b.initiator_member_id]


def initiator(b: Booking) -> BookingParticipant:
    return next(p for p in b.participants if p.id == b.initiator_member_id)


def member_of(b: Booking, user: Optional[dict]) -> BookingParticipant:
    if user:
        for p in b.participants:
            if p.user_id == user["sub"]:
                return p
    raise HTTPException(status_code=403, detail="You're not part of this booking")


def display_name(p: BookingParticipant) -> str:
    return p.display_name or p.seat_label or "Friend"


# ── Price lock + shares ──────────────────────────────────────────────────────

def per_person(deal: Deal) -> bool:
    """A deal priced per person ("pp", the default) costs price × people; one
    priced per lane / room / table costs its price for the whole group —
    exactly what checkout shows."""
    return (deal.unit or "pp") == "pp"


def lock_price(b: Booking, deal: Deal) -> None:
    """Freeze the price. Called once — at creation, or at Huddle resolution —
    and never again: later deal repricing can't reach this booking.

    locked_unit_price_cents is what one extra person adds (and what taking
    one out removes): the price for a per-person deal, nothing for a
    per-lane / per-room one, where the group shares one fixed price."""
    price = cents(deal.deal_price)
    if per_person(deal):
        b.locked_unit_price_cents = price
        b.locked_price_cents = price * b.num_people
    else:
        b.locked_unit_price_cents = 0
        b.locked_price_cents = price
    b.total_paid = b.locked_price_cents / 100


def set_share(p: BookingParticipant, share_cents: int) -> None:
    """Store a seat's share and its deposit/balance. A changed amount on an
    unpaid seat moves its nonce on, so a stale Pinch result can't be replayed
    against the new amount. A $0 share owes nothing and is settled."""
    if p.deposit_status in DEPOSIT_FIXED:
        if p.share_amount_cents != share_cents:
            raise SplitError(f"{display_name(p)} has already paid, so their share can't change")
        return
    if p.share_amount_cents is not None and p.share_amount_cents != share_cents:
        p.deposit_attempt += 1
    p.share_amount_cents = share_cents
    p.deposit_cents, p.balance_cents = deposit_split(share_cents)
    if share_cents == 0:
        p.deposit_status = "settled"
    elif p.deposit_status == "settled":
        p.deposit_status = "unpaid"


def _apply(b: Booking, amounts: Dict[str, int], covers: Dict[str, str]) -> None:
    for p in b.participants:
        p.covered_by_member_id = covers.get(p.id)
        set_share(p, amounts[p.id])


def even_shares(b: Booking) -> None:
    """Initial even split: exactly the Huddle rule, initiator absorbs the remainder."""
    order = share_order(b)
    for p, share in zip(order, compute_shares(b.locked_price_cents, len(order))):
        set_share(p, share["total_cents"])


def _fixed_ids(b: Booking) -> set:
    return {p.id for p in b.participants if p.deposit_status in DEPOSIT_FIXED}


def _current(b: Booking) -> Dict[str, int]:
    return {p.id: p.share_amount_cents or 0 for p in b.participants}


def _current_covers(b: Booking) -> Dict[str, str]:
    return {p.id: p.covered_by_member_id for p in b.participants if p.covered_by_member_id}


def edit_split(b: Booking, mode: str, amounts: Optional[Dict[str, int]], covers: Dict[str, str]) -> None:
    """Replace the split for seats that haven't paid. Paid seats are never
    touched; a request that would change one is rejected, not adjusted."""
    ids = {p.id for p in b.participants}
    fixed = _fixed_ids(b)
    if any(k not in ids or v not in ids for k, v in covers.items()):
        raise SplitError("That seat isn't part of this booking")
    for covered, coverer in covers.items():
        if covered == coverer:
            raise SplitError("You can't cover your own share")
        if covered in covers.values() or coverer in covers:
            raise SplitError("A seat can't both cover and be covered")
    for covered, coverer in _current_covers(b).items():
        if coverer in fixed and covers.get(covered) != coverer:
            raise SplitError("That share was covered by someone who has already paid, so it stays covered")
    for covered, coverer in covers.items():
        if covered in fixed and _current_covers(b).get(covered) != coverer:
            raise SplitError("They've already paid their share")
        if coverer in fixed and _current_covers(b).get(covered) != coverer:
            raise SplitError("Your share is already paid, so it can't be increased")

    if mode == "even":
        new = recalc_unpaid([p.id for p in share_order(b)], _current(b), covers, fixed, b.locked_price_cents)
    elif mode == "custom":
        if amounts is None or set(amounts) != ids:
            raise SplitError("Give an amount for every seat")
        for pid in fixed:
            if amounts[pid] != _current(b)[pid]:
                raise SplitError("Someone who has already paid would change amount — their share is locked")
        for covered in covers:
            if amounts[covered] != 0:
                raise SplitError("A covered share must be $0.00")
        validate_custom(list(amounts.values()), b.locked_price_cents)
        new = dict(amounts)
    else:
        raise SplitError("Split mode must be even or custom")
    b.split_mode = mode
    _apply(b, new, covers)


def cover(b: Booking, coverer: BookingParticipant, covered_id: str) -> None:
    """One tap: `coverer` takes on `covered_id`'s share."""
    new, covers = apply_cover(_current(b), _current_covers(b), _fixed_ids(b), coverer.id, covered_id)
    b.split_mode = "custom"
    _apply(b, new, covers)


def remove_seat(db: Session, b: Booking, p: BookingParticipant) -> None:
    """The group shrinks: one fewer seat, one locked unit price off the total,
    one spot back to the deal, and the unpaid seats re-split what's left."""
    if p.id == b.initiator_member_id:
        raise SplitError("The person who booked can't be removed")
    if p.deposit_status in DEPOSIT_FIXED:
        raise SplitError(f"{display_name(p)} has already paid — removing them would mean a refund")
    if b.num_people <= 1:
        raise SplitError("A booking needs at least one person")
    covers = {k: v for k, v in _current_covers(b).items() if p.id not in (k, v)}
    remaining = [q for q in b.participants if q.id != p.id]
    fixed = _fixed_ids(b)
    new_total = b.locked_price_cents - b.locked_unit_price_cents
    order = [q.id for q in share_order(b) if q.id != p.id]
    new = recalc_unpaid(order, {q.id: q.share_amount_cents or 0 for q in remaining}, covers, fixed, new_total)

    b.num_people -= 1
    b.locked_price_cents = new_total
    b.total_paid = new_total / 100
    b.split_mode = "even"
    if b.spots_held and b.deal:
        _deal_for_update(db, b).spots_remaining += 1
    for q in b.participants:
        if q.covered_by_member_id == p.id:
            q.covered_by_member_id = None
    b.participants.remove(p)
    db.delete(p)
    _apply(b, new, covers)


# ── Spots ────────────────────────────────────────────────────────────────────

def _deal_for_update(db: Session, b: Booking) -> Deal:
    return db.query(Deal).filter(Deal.id == b.deal_id).with_for_update().one()


def lock_spots(db: Session, b: Booking) -> None:
    """Take the whole group's spots out of the deal, once."""
    if b.spots_held:
        return
    deal = _deal_for_update(db, b)
    if deal.spots_remaining < b.num_people:
        raise HTTPException(status_code=409, detail=f"Only {deal.spots_remaining} spot(s) remaining")
    deal.spots_remaining -= b.num_people
    b.spots_held = True


def release_spots(db: Session, b: Booking) -> None:
    if not b.spots_held:
        return
    deal = _deal_for_update(db, b)
    deal.spots_remaining = min(deal.spots_remaining + b.num_people, deal.total_spots)
    b.spots_held = False


def share_deadline_for(deal: Deal, slot_time: Optional[str]) -> Optional[datetime]:
    """min(deal expiry, booked slot − 1h) — the same cutoff Huddle uses."""
    return deal_cutoff(deal.expires_at, deal.date, [slot_time] if slot_time else (deal.slots or []))


# ── Code + confirmation ──────────────────────────────────────────────────────

def generate_code(db: Session) -> str:
    """A 6-digit code the customer reads out / the venue types in."""
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    for _ in range(10):
        if not db.query(Booking).filter(Booking.confirmation_code == code).first():
            return code
        code = "".join(secrets.choice("0123456789") for _ in range(6))
    return code


def locked_in(b: Booking) -> bool:
    """The person booking has paid (a Huddle locks at resolution instead)."""
    if b.has_voting:
        return b.status != "voting"
    return bool(b.initiator_member_id) and initiator(b).deposit_status in DEPOSIT_FIXED


def all_in(b: Booking) -> bool:
    return all(p.deposit_status in DEPOSIT_DONE for p in b.participants)


def confirm(db: Session, b: Booking) -> None:
    """Issue the code. Every participant's device flips to the confirmation
    at the same moment via the realtime poke; push covers backgrounded apps."""
    b.confirmation_code = generate_code(db)
    b.status = "confirmed"
    touch(b)
    db.commit()
    db.refresh(b)
    venue_name = b.deal.venue.name if b.deal and b.deal.venue else "the venue"
    if len(b.participants) > 1:
        push_all(db, b, "You're all set 🎉",
                 f"Show code {b.confirmation_code} at {venue_name}.", "booking_confirmed",
                 extra={"code": b.confirmation_code})
    logger.info("Booking %s confirmed with code %s", b.id, b.confirmation_code)


def maybe_confirm(db: Session, b: Booking) -> None:
    if b.status == "collecting" and all_in(b):
        confirm(db, b)


# ── Deposit fan-out ──────────────────────────────────────────────────────────

def deposit_nonce(b: Booking, p: BookingParticipant) -> str:
    return f"deposit-{b.id}-{p.id}-{p.deposit_attempt}"


def _metadata(b: Booking, p: BookingParticipant, kind: str, **extra) -> dict:
    return {
        "impulseBookingId": b.id,
        "impulseMemberId": p.id,
        "type": kind,
        "hasVoting": bool(b.has_voting),
        **extra,
    }


def pay_share(db: Session, b: Booking, p: BookingParticipant, user: dict, body) -> None:
    """Charge one seat's deposit share — exactly the amount the payer was
    shown (body.expected_deposit_cents), or nothing at all. The initiator's
    payment on a direct booking also takes the group's spots."""
    if b.status != "collecting":
        raise HTTPException(status_code=409, detail=f"This booking isn't collecting shares (status={b.status})")
    if not b.split_confirmed_at:
        raise HTTPException(status_code=409, detail="The split hasn't been confirmed yet")
    if p.deposit_status != "unpaid":
        raise HTTPException(status_code=409, detail="This share is already settled")
    if b.share_deadline and now() > b.share_deadline:
        raise HTTPException(status_code=409, detail="The deadline for this booking has passed")
    if not b.has_voting and p.id != b.initiator_member_id and initiator(b).deposit_status != "paid":
        raise HTTPException(status_code=409, detail="This booking isn't locked in yet")
    if body.expected_deposit_cents != p.deposit_cents:
        raise HTTPException(
            status_code=409,
            detail=f"Your share changed to {fmt_cents(p.share_amount_cents)} — have a look before confirming",
        )

    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        row = User(id=user["sub"], email=user.get("email"))
        db.add(row)
        db.flush()

    if not b.has_voting and p.id == b.initiator_member_id:
        lock_spots(db, b)   # same transaction: a failed charge rolls the hold back

    nonce = deposit_nonce(b, p)
    try:
        p.pinch_payer_id, p.pinch_source_id = wallet.resolve_source(
            db, row,
            payment_method_id=body.payment_method_id,
            token=body.token,
            save_card=body.save_card,
            first_name=body.first_name,
            last_name=body.last_name,
            email=body.email,
        )
        payment = payments.charge_deposit(
            payer_id=p.pinch_payer_id,
            source_id=p.pinch_source_id,
            amount_cents=p.deposit_cents,
            description=f"Impulse deposit — {b.deal.venue.name} {slot_label(b)}",
            metadata=_metadata(
                b, p, "deposit",
                depositAmountCents=p.deposit_cents,
                balanceAmountCents=p.balance_cents,
                shareTotalCents=p.share_amount_cents,
            ),
            nonce=nonce,
            merchant_id=PINCH_MERCHANT_ID,
        )
    except PinchError as e:
        db.rollback()
        logger.error("Deposit failed for booking %s seat %s (nonce %s): %s %s",
                     b.id, p.id, nonce, e.status_code, e.body)
        if _definitive_decline(e):
            _bump_attempt(db, p.id)
        raise HTTPException(status_code=402, detail=f"Deposit payment failed: {e.body}")

    p.deposit_payment_id = payment["id"]
    p.deposit_status = "paid"
    touch(b)
    db.commit()
    db.refresh(b)
    logger.info("Booking %s: seat %s paid deposit (%d/%d in)", b.id, p.id,
                sum(q.deposit_status in DEPOSIT_DONE for q in b.participants), len(b.participants))
    maybe_confirm(db, b)


def _definitive_decline(e: PinchError) -> bool:
    """Pinch said no (declined, or rejected the request outright). A 403 is a
    nonce replay we couldn't accept — money may have moved, so the nonce must
    NOT move on; that one needs a human."""
    return isinstance(e, PaymentNotApproved) or (400 <= e.status_code < 500 and e.status_code != 403)


def _bump_attempt(db: Session, member_id: str) -> None:
    db.query(BookingParticipant).filter(BookingParticipant.id == member_id).update(
        {BookingParticipant.deposit_attempt: BookingParticipant.deposit_attempt + 1},
        synchronize_session=False,
    )
    db.commit()


# ── Decline handler (the one) ────────────────────────────────────────────────

def handle_decline(p: BookingParticipant, kind: str, amount_cents: int, payer_name: str) -> str:
    """A charge that couldn't go through never blocks the booking. Flag the
    seat for follow-up and return the venue-facing warning."""
    setattr(p, f"{kind}_status", "declined")
    p.payment_followup = True
    p.payment_note = (
        f"We couldn't charge the card for {fmt_cents(amount_cents)} — "
        f"please settle it directly with the venue."
    )
    return f"Card declined — collect {fmt_cents(amount_cents)} from {payer_name} directly"


# ── Guarantor (direct bookings) ──────────────────────────────────────────────

def charge_guarantor(db: Session, b: Booking) -> int:
    """At the share deadline, every seat still unpaid falls to the initiator's
    card: nonce guarantor-{bookingId}-{memberId}. Each seat commits on its
    own, so a crash mid-loop resumes with the same nonces (a replay of an
    approved charge counts as done). Returns how many seats were guaranteed.
    The code issues afterwards regardless — the booking was never at risk."""
    ini = initiator(b)
    guaranteed = 0
    for p in share_order(b):
        if p.deposit_status != "unpaid" or not p.deposit_cents:
            continue
        try:
            payment = payments.charge_deposit(
                payer_id=ini.pinch_payer_id,
                source_id=ini.pinch_source_id,
                amount_cents=p.deposit_cents,
                description=f"Impulse deposit (covering {display_name(p)}) — {b.deal.venue.name} {slot_label(b)}",
                metadata=_metadata(
                    b, p, "guarantor_deposit",
                    guarantorMemberId=ini.id,
                    depositAmountCents=p.deposit_cents,
                    balanceAmountCents=p.balance_cents,
                    shareTotalCents=p.share_amount_cents,
                ),
                nonce=f"guarantor-{b.id}-{p.id}",
                merchant_id=PINCH_MERCHANT_ID,
            )
            p.deposit_payment_id = payment["id"]
            p.deposit_status = "guaranteed"
            guaranteed += 1
        except PinchError as e:
            logger.error("Guarantor charge failed for booking %s seat %s: %s %s",
                         b.id, p.id, e.status_code, e.body)
            handle_decline(p, "deposit", p.deposit_cents, display_name(ini))
        touch(b)
        db.commit()
    return guaranteed


# ── Balance fan-out at redemption ────────────────────────────────────────────

def _balance_source(b: Booking, p: BookingParticipant) -> BookingParticipant:
    """Whose card pays this seat's balance: its own, or the initiator's when
    the initiator guaranteed the seat at the deadline."""
    return initiator(b) if p.deposit_status in ("guaranteed", "declined") else p


def redeem(db: Session, b: Booking) -> dict:
    """Venue confirms the booking: one balance charge per seat (nonce
    balance-{bookingId}-{memberId}). A decline is flagged but never blocks
    the rest — the booking is still redeemed."""
    venue_name = b.deal.venue.name
    results = []
    total_charged = 0
    declines = 0
    for p in share_order(b):
        bal = p.balance_cents or 0
        payer = _balance_source(b, p)
        name = display_name(p)
        if bal <= 0 or p.deposit_status in ("settled", "refunded"):
            p.balance_status = "paid"
            results.append({"name": name, "balance_cents": 0, "status": "paid", "warning": None})
            continue
        if p.balance_status == "paid":
            total_charged += bal
            results.append({"name": name, "balance_cents": bal, "status": "paid", "warning": None})
            continue
        try:
            if not (payer.pinch_payer_id and payer.pinch_source_id):
                raise PinchError(0, "no card on file for this seat")
            payment = payments.charge_balance(
                payer_id=payer.pinch_payer_id,
                source_id=payer.pinch_source_id,
                amount_cents=bal,
                application_fee_cents=round(bal * payments.BALANCE_APPLICATION_FEE_RATE),
                description=f"Impulse balance — {venue_name} {slot_label(b)}",
                metadata=_metadata(b, p, "balance", balanceAmountCents=bal, paidByMemberId=payer.id),
                nonce=f"balance-{b.id}-{p.id}",
                merchant_id=PINCH_MERCHANT_ID,
            )
            p.balance_payment_id = payment["id"]
            p.balance_status = "paid"
            if payer is p:
                p.payment_note = (
                    f"Your booking at {venue_name} has been confirmed — "
                    f"{fmt_cents(bal)} has been charged to your card. Enjoy!"
                )
            total_charged += bal
            results.append({"name": name, "balance_cents": bal, "status": "paid", "warning": None})
        except PinchError as e:
            logger.error("Balance charge failed for booking %s seat %s: %s %s", b.id, p.id, e.status_code, e.body)
            declines += 1
            results.append({"name": name, "balance_cents": bal, "status": "declined",
                            "warning": handle_decline(p, "balance", bal, display_name(payer))})

    b.status = "redeemed"
    b.redeemed_at = now()
    touch(b)
    db.commit()
    logger.info("Booking %s redeemed at %s: charged %d cents, %d decline(s)", b.id, venue_name, total_charged, declines)
    return {"members": results, "total_charged_cents": total_charged, "declines": declines}


# ── Refund path (Huddle collapse / cancel) ───────────────────────────────────

def refund_participants(b: Booking, reason: str) -> tuple:
    """Refund every seat that paid its own deposit. Only Huddles refund: a
    collapsed Huddle never became a real booking. Returns (refunded, failed)."""
    refunded = failed = 0
    for p in b.participants:
        if p.deposit_status != "paid":
            continue
        try:
            payments.refund_full(
                payment_id=p.deposit_payment_id,
                reason=reason,
                nonce=f"refund-{b.id}-{p.id}",
                merchant_id=PINCH_MERCHANT_ID,
            )
            p.deposit_status = "refunded"
            refunded += 1
        except PinchError as e:
            failed += 1
            logger.error("Refund failed for booking %s seat %s: %s %s — needs manual follow-up",
                         b.id, p.id, e.status_code, e.body)
    return refunded, failed


# ── Push ─────────────────────────────────────────────────────────────────────

def member_push_tokens(db: Session, participants: Sequence[BookingParticipant]) -> dict:
    """user_id → expo push token for participants that have one. Defensive raw
    SQL: returns {} until the expo_push_token column has been migrated."""
    user_ids = [p.user_id for p in participants if p.user_id]
    if not user_ids:
        return {}
    try:
        rows = db.execute(
            text("select id, expo_push_token from users where id = any(:ids) and expo_push_token is not null"),
            {"ids": user_ids},
        ).fetchall()
        return {str(r[0]): r[1] for r in rows}
    except Exception:
        db.rollback()
        return {}


def push_data(b: Booking, event_type: str, extra: Optional[dict] = None) -> dict:
    data = {"bookingId": b.id, "type": event_type, **(extra or {})}
    if b.has_voting:
        data["huddleId"] = b.id
    return data


def push_all(db: Session, b: Booking, title: str, body: str, event_type: str,
             extra: Optional[dict] = None) -> None:
    """Push the same message to every participant that has a token."""
    tokens = member_push_tokens(db, b.participants)
    messages = [
        {"to": tokens[p.user_id], "title": title, "body": body, "data": push_data(b, event_type, extra)}
        for p in b.participants if p.user_id and tokens.get(p.user_id)
    ]
    if messages:
        push.send_push_many(messages)


# ── Deadline sweep ───────────────────────────────────────────────────────────

def sweep_deadlines(db: Session) -> dict:
    """Move bookings past their deadlines on. Runs on a timer (see main.py)
    and as a one-shot script (sweep_bookings.py).

    - Voting deadline passed while still voting → expired, nobody charged.
    - Share deadline passed while collecting:
        · Huddle: some deposits paid → refund each (refund-{b}-{m}), collapsed;
          none paid → expired. Spots go back to the deal.
        · Direct: unpaid seats fall to the initiator (guarantor-{b}-{m}) and
          the code issues regardless.
    """
    t = now()
    counts = {"expired_voting": 0, "collapsed": 0, "expired_payment": 0,
              "guaranteed": 0, "refund_failures": 0}

    voting = (
        db.query(Booking)
        .options(joinedload(Booking.participants))
        .filter(Booking.status == "voting", Booking.voting_deadline.isnot(None), Booking.voting_deadline < t)
        .all()
    )
    for b in voting:
        b.status = "expired"
        touch(b)
        db.commit()
        push_all(db, b, "Plan expired", "Your huddle didn't fill up in time — nobody was charged.", "huddle_expired")
        counts["expired_voting"] += 1
        logger.info("Booking %s expired (voting deadline)", b.id)

    due = (
        db.query(Booking)
        .options(joinedload(Booking.participants), joinedload(Booking.deal).joinedload(Deal.venue))
        .filter(Booking.status == "collecting", Booking.share_deadline.isnot(None), Booking.share_deadline < t)
        .all()
    )
    for b in due:
        if b.has_voting:
            _collapse(db, b, counts)
        elif initiator(b).deposit_status != "paid":
            # The initiator never paid, so nothing was locked or guaranteed.
            b.status = "expired"
            touch(b)
            db.commit()
            counts["expired_payment"] += 1
        else:
            counts["guaranteed"] += charge_guarantor(db, b)
            confirm(db, b)
    return counts


def _collapse(db: Session, b: Booking, counts: dict) -> None:
    paid = [p for p in b.participants if p.deposit_status == "paid"]
    release_spots(db, b)
    if not paid:
        b.status = "expired"
        touch(b)
        db.commit()
        push_all(db, b, "Plan expired", "The group didn't all pay in time — nobody was charged.", "huddle_expired")
        counts["expired_payment"] += 1
        logger.info("Booking %s expired (share deadline, no payments)", b.id)
        return
    _, failed = refund_participants(b, "Impulse huddle plan expired")
    counts["refund_failures"] += failed
    b.status = "collapsed"
    touch(b)
    db.commit()
    push_all(db, b, "Plan expired", "The group didn't all pay in time — you've been refunded.", "huddle_collapsed")
    counts["collapsed"] += 1
    logger.info("Booking %s collapsed (share deadline), refunded %d seat(s)", b.id, len(paid))


# ── Views ────────────────────────────────────────────────────────────────────

def _state(p: BookingParticipant) -> str:
    if p.covered_by_member_id:
        return "covered"
    return {"unpaid": "waiting"}.get(p.deposit_status, p.deposit_status)


def my_share(b: Booking, p: BookingParticipant):
    from schemas import MyShare
    if p.share_amount_cents is None:
        return None
    coverer = next((q for q in b.participants if q.id == p.covered_by_member_id), None)
    return MyShare(
        share_cents=p.share_amount_cents,
        deposit_cents=p.deposit_cents or 0,
        balance_cents=p.balance_cents or 0,
        status=p.deposit_status,
        covered_by_name=display_name(coverer) if coverer else None,
    )


def view(b: Booking, me: Optional[BookingParticipant]):
    """The one booking view — the live meter, the Huddle screen and the split
    screen all render this. Everyone in the booking gets the same
    confirmation_code at the same moment."""
    from schemas import BookingView, DealWithVenueResponse, ParticipantPublic
    is_ini = me is not None and me.id == b.initiator_member_id
    ini = initiator(b) if b.initiator_member_id else None
    seats = share_order(b)
    exposure = None
    if not b.has_voting and b.status == "collecting":
        exposure = sum(p.share_amount_cents or 0 for p in seats
                       if p.id != b.initiator_member_id and p.deposit_status == "unpaid")
    elif not b.has_voting:
        exposure = 0
    return BookingView(
        id=b.id,
        has_voting=b.has_voting,
        status=b.status,
        group_size=b.num_people,
        split_mode=b.split_mode,
        split_confirmed=b.split_confirmed_at is not None,
        locked_price_cents=b.locked_price_cents,
        slot_time=b.slot_time,
        share_deadline=b.share_deadline,
        voting_deadline=b.voting_deadline,
        join_token=b.join_token if b.status == "voting" else None,
        initiator_name=display_name(ini) if ini else "Someone",
        locked_in=locked_in(b),
        deal=DealWithVenueResponse.from_deal(b.deal) if b.deal else None,
        confirmation_code=b.confirmation_code if b.status in ("confirmed", "redeemed") else None,
        participants=[
            ParticipantPublic(
                id=p.id,
                display_name=display_name(p),
                seat_label=p.seat_label,
                is_initiator=p.id == b.initiator_member_id,
                is_me=me is not None and p.id == me.id,
                claimed=p.user_id is not None,
                invited=p.user_id is not None and p.claimed_at is None,
                has_voted=p.ballot_at is not None,
                state=_state(p),
                share_cents=p.share_amount_cents if (is_ini or (me is not None and p.id == me.id)) else None,
                seat_token=p.seat_token if (is_ini and p.user_id is None) else None,
            )
            for p in seats
        ],
        paid_count=sum(1 for p in seats if p.deposit_status in DEPOSIT_DONE),
        initiator_exposure_cents=exposure,
        created_at=b.created_at,
        my_member_id=me.id if me else None,
        is_initiator=is_ini,
        my_has_voted=bool(me and me.ballot_at),
        my_share=my_share(b, me) if me else None,
    )


def push_shares(db: Session, b: Booking) -> None:
    """Tell each Huddle member their own share once the creator confirms the
    split — an invitation, never an invoice."""
    tokens = member_push_tokens(db, b.participants)
    venue = b.deal.venue.name if b.deal and b.deal.venue else "the venue"
    messages = []
    for p in b.participants:
        token = tokens.get(p.user_id or "")
        if not token or p.id == b.initiator_member_id:
            continue
        body = (
            f"{venue} {slot_label(b)} — {display_name(initiator(b))} is covering your share"
            if p.covered_by_member_id else
            f"{venue} {slot_label(b)} — your share is {fmt_cents(p.share_amount_cents or 0)}"
        )
        messages.append({"to": token, "title": "You're in", "body": body,
                         "data": push_data(b, "split_confirmed")})
    if messages:
        push.send_push_many(messages)


def push_invite(db: Session, b: Booking, p: BookingParticipant) -> None:
    """The invitee hears about it the way they'd hear from a friend."""
    token = member_push_tokens(db, [p]).get(p.user_id or "")
    if not token:
        return
    venue = b.deal.venue.name if b.deal and b.deal.venue else "somewhere"
    push.send_push_many([{
        "to": token,
        "title": f"{display_name(initiator(b))} saved you a spot",
        "body": f"{venue}, {slot_label(b)} — your share is {fmt_cents(p.share_amount_cents or 0)}",
        "data": push_data(b, "seat_invite"),
    }])


def push_declined(db: Session, b: Booking, name: str) -> None:
    ini = initiator(b)
    token = member_push_tokens(db, [ini]).get(ini.user_id or "")
    if token:
        push.send_push_many([{
            "to": token,
            "title": f"{name} can't make it",
            "body": "Their spot is open again — invite someone else or take them out of the split.",
            "data": push_data(b, "seat_declined"),
        }])
