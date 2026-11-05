"""
The one booking flow. Solo bookings, direct split bookings and Huddles (a
booking with a voting stage) all run through here once the deal is known:
price lock, shares, holding each seat's card, the guarantor hold, the capture
at redemption, the decline handler, releasing holds and the deadline sweep.
Routers own HTTP shape and auth; they never charge or release directly.

Money (Stripe, see payments.py): claiming a spot HOLDS the seat's whole share
on the card; the venue redeeming the code CAPTURES it and the venue is paid
out instantly. A seat's deposit_status "paid" now means "held" (or saved, for
a far-off booking); balance_status "paid" means captured.

The only fork on has_voting after resolution is at the share deadline:
a Huddle collapses and releases its holds (nobody guaranteed it), a direct
booking falls to its initiator's card (the initiator guaranteed it when they
booked).

Stripe idempotency keys:
  deposit-{bookingId}-{memberId}-{attempt}   a seat's own hold
  guarantor-{bookingId}-{memberId}           initiator covering an unpaid seat at the deadline
  balance-{bookingId}-{memberId}             capture at redemption
  noshow-{bookingId}-{memberId}              10% capture for a no-show
  refund-{bookingId}-{memberId}              Huddle collapse / cancel (hold released)
`attempt` moves on after a share change, so a stale hold for the old amount
can never be reused.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import event, inspect as sa_inspect
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session, joinedload

import payments
import push
import wallet
from booking_logic import (
    SplitError, apply_cover, compute_shares, deal_cutoff, deposit_split, fmt_cents, recalc_unpaid, slot_at,
    validate_custom,
)
from models import Booking, BookingParticipant, Deal, User
from payments import PaymentError, PaymentNotApproved

logger = logging.getLogger("impulse.booking_flow")

# A seat whose deposit is settled one way or another — nothing left to collect.
DEPOSIT_DONE = ("paid", "guaranteed", "settled", "declined")
# A seat whose amount can no longer change: money has moved against it.
DEPOSIT_FIXED = ("paid", "guaranteed")


def now() -> datetime:
    return datetime.now(timezone.utc)


def touch(b: Booking) -> None:
    """Bump updated_at — the realtime poke that tells every participant to
    refetch. Also marks the booking so its Live Activities update once the
    commit lands (a booking with no id yet can't have any)."""
    b.updated_at = sa_func.now()
    state = sa_inspect(b, raiseerr=False)
    session = state.session if state is not None else None
    if session is not None and b.id:
        session.info.setdefault("touched_bookings", set()).add(b.id)


@event.listens_for(Session, "after_commit")
def _push_touched(session: Session) -> None:
    touched = session.info.pop("touched_bookings", None)
    if touched:
        import live_activity
        live_activity.enqueue(touched)


@event.listens_for(Session, "after_rollback")
def _forget_touched(session: Session) -> None:
    session.info.pop("touched_bookings", None)


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
    unpaid seat moves its nonce on, so a hold created for the old amount is
    never reused. A $0 share owes nothing and is settled."""
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


# ── Holding a seat ───────────────────────────────────────────────────────────

def deposit_nonce(b: Booking, p: BookingParticipant) -> str:
    return f"deposit-{b.id}-{p.id}-{p.deposit_attempt}"


def _metadata(b: Booking, p: BookingParticipant, kind: str, **extra) -> dict:
    """Stripe metadata values must be strings."""
    return {
        "impulseBookingId": str(b.id),
        "impulseMemberId": str(p.id),
        "type": kind,
        "hasVoting": "true" if b.has_voting else "false",
        **{k: str(v) for k, v in extra.items()},
    }


def slot_start(b: Booking) -> Optional[datetime]:
    if not b.deal or not b.slot_time:
        return None
    return slot_at(b.deal.date, b.slot_time)


def venue_account(b: Booking) -> str:
    """The venue's connected account, or a 409 when it can't take money yet.
    Destination charges to an account whose transfers aren't active fail, so
    nothing is held for a venue that hasn't finished Stripe onboarding."""
    venue = b.deal.venue if b.deal else None
    if not venue or not venue.stripe_account_id or venue.stripe_transfers_status != "active":
        raise HTTPException(status_code=409, detail="This venue can't take bookings right now")
    return venue.stripe_account_id


def _ensure_user(db: Session, user: dict) -> User:
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        row = User(id=user["sub"], email=user.get("email"))
        db.add(row)
        db.flush()
    return row


def _check_payable(b: Booking, p: BookingParticipant, expected_share_cents: int) -> None:
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
    if expected_share_cents != p.share_amount_cents:
        raise HTTPException(
            status_code=409,
            detail=f"Your share changed to {fmt_cents(p.share_amount_cents)} — have a look before confirming",
        )


def start_hold(db: Session, b: Booking, p: BookingParticipant, user: dict, expected_share_cents: int) -> dict:
    """Step 1 of claiming a spot: create the hold (or, for a booking more than
    HOLD_AHEAD away, a SetupIntent that saves the card) and hand PaymentSheet
    what it needs. Nothing is held until the app confirms it.

    The idempotency key is the seat's nonce, so asking twice returns the same
    intent; a changed share moves the nonce on and gets a fresh one."""
    _check_payable(b, p, expected_share_cents)
    destination = venue_account(b)
    row = _ensure_user(db, user)
    sheet = wallet.sheet_params(row)
    nonce = deposit_nonce(b, p)
    venue_name = b.deal.venue.name
    try:
        if payments.needs_setup_first(slot_start(b)):
            intent = payments.create_setup(
                customer_id=sheet["customer_id"],
                metadata=_metadata(b, p, "save_card", shareTotalCents=p.share_amount_cents),
                idempotency_key=f"setup-{nonce}",
            )
            kind = "setup"
        else:
            intent = payments.create_hold(
                customer_id=sheet["customer_id"],
                amount_cents=p.share_amount_cents,
                destination=destination,
                description=f"Impulse — {venue_name} {slot_label(b)}",
                metadata=_metadata(b, p, "hold", shareTotalCents=p.share_amount_cents,
                                   depositAmountCents=p.deposit_cents),
                idempotency_key=nonce,
            )
            kind = "payment"
    except PaymentError as e:
        db.rollback()
        logger.error("Starting a hold failed for booking %s seat %s: %s %s",
                     b.id, p.id, e.status_code, e.body)
        raise HTTPException(status_code=502, detail="Couldn't start the payment. Try again.")

    p.deposit_payment_id = intent["id"]
    db.commit()
    return {
        "intent_type": kind,
        "intent_id": intent["id"],
        "client_secret": intent["client_secret"],
        "amount_cents": p.share_amount_cents,
        **sheet,
    }


def confirm_hold(db: Session, b: Booking, p: BookingParticipant, user: Optional[dict], intent_id: str) -> None:
    """Step 2: PaymentSheet says the card is held (or saved). Read the intent
    back from Stripe rather than trusting the app, then mark the seat in. Also
    called by the webhook as a backstop for an app closed mid-payment, so it is
    idempotent: a seat already in on this intent is left alone."""
    if p.deposit_status in DEPOSIT_FIXED and p.deposit_payment_id == intent_id:
        return
    if not intent_id or intent_id != p.deposit_payment_id:
        raise HTTPException(status_code=409, detail="That payment isn't for this share")
    _check_payable(b, p, p.share_amount_cents)

    try:
        if intent_id.startswith("seti_"):
            intent = payments.retrieve_setup(intent_id)
            if intent.get("status") != "succeeded":
                raise HTTPException(status_code=402, detail="Your card wasn't saved. Try again.")
            p.hold_status = "saved"
            p.hold_expires_at = None
        else:
            intent = payments.retrieve_hold(intent_id)
            if intent.get("status") != "requires_capture":
                raise HTTPException(status_code=402, detail="Your card wasn't authorised. Try again.")
            if intent.get("amount") != p.share_amount_cents:
                # The amount held must be the amount consented to — never adjust.
                payments.cancel_hold(intent_id=intent_id, idempotency_key=f"cancel-{intent_id}")
                raise HTTPException(status_code=409, detail="Your share changed — have a look before confirming")
            p.hold_status = "held"
            p.hold_expires_at = payments.hold_expires_at(intent)
    except PaymentError as e:
        logger.error("Confirming hold %s for booking %s seat %s failed: %s %s",
                     intent_id, b.id, p.id, e.status_code, e.body)
        raise HTTPException(status_code=502, detail="Couldn't confirm the payment. Try again.")

    p.stripe_payment_method_id = payments.payment_method_of(intent)
    if not b.has_voting and p.id == b.initiator_member_id:
        try:
            lock_spots(db, b)
        except HTTPException:
            db.rollback()
            if intent_id.startswith("pi_"):
                payments.cancel_hold(intent_id=intent_id, idempotency_key=f"cancel-{intent_id}")
            raise

    p.deposit_status = "paid"
    touch(b)
    db.commit()
    db.refresh(b)
    logger.info("Booking %s: seat %s %s (%d/%d in)", b.id, p.id, p.hold_status,
                sum(q.deposit_status in DEPOSIT_DONE for q in b.participants), len(b.participants))
    maybe_confirm(db, b)


def confirm_hold_from_webhook(db: Session, intent_id: str) -> None:
    """payment_intent.amount_capturable_updated / setup_intent.succeeded."""
    p = db.query(BookingParticipant).filter(BookingParticipant.deposit_payment_id == intent_id).first()
    if not p or p.deposit_status != "unpaid":
        return
    b = load(db, p.booking_id, lock=True)
    p = next(q for q in b.participants if q.id == p.id)
    try:
        confirm_hold(db, b, p, None, intent_id)
    except HTTPException as e:
        db.rollback()
        logger.warning("Webhook could not finalise %s for booking %s: %s", intent_id, b.id, e.detail)


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


def _customer_of(db: Session, p: BookingParticipant) -> Optional[str]:
    if not p.user_id:
        return None
    row = db.query(User).filter(User.id == p.user_id).first()
    return row.stripe_customer_id if row else None


# ── Guarantor (direct bookings) ──────────────────────────────────────────────

def charge_guarantor(db: Session, b: Booking) -> int:
    """At the share deadline, every seat still unpaid falls to the initiator's
    card: an off-session hold for that seat's share (guarantor-{b}-{m}). Each
    seat commits on its own, so a crash mid-loop resumes with the same keys.
    Returns how many seats were guaranteed. The code issues afterwards
    regardless — the booking was never at risk."""
    ini = initiator(b)
    customer_id = _customer_of(db, ini)
    guaranteed = 0
    for p in share_order(b):
        if p.deposit_status != "unpaid" or not p.share_amount_cents:
            continue
        try:
            if not (customer_id and ini.stripe_payment_method_id):
                raise PaymentNotApproved(0, "no card on file for the initiator")
            hold = payments.place_offsession_hold(
                customer_id=customer_id,
                payment_method_id=ini.stripe_payment_method_id,
                amount_cents=p.share_amount_cents,
                destination=venue_account(b),
                description=f"Impulse (covering {display_name(p)}) — {b.deal.venue.name} {slot_label(b)}",
                metadata=_metadata(b, p, "guarantor_hold", guarantorMemberId=ini.id,
                                   shareTotalCents=p.share_amount_cents),
                idempotency_key=f"guarantor-{b.id}-{p.id}",
            )
            p.deposit_payment_id = hold["id"]
            p.stripe_payment_method_id = ini.stripe_payment_method_id
            p.hold_status = "held"
            p.hold_expires_at = payments.hold_expires_at(hold)
            p.deposit_status = "guaranteed"
            guaranteed += 1
        except (PaymentError, HTTPException) as e:
            logger.error("Guarantor hold failed for booking %s seat %s: %s", b.id, p.id, e)
            handle_decline(p, "deposit", p.share_amount_cents, display_name(ini))
        touch(b)
        db.commit()
    return guaranteed


# ── Capture at redemption ────────────────────────────────────────────────────

def _payer_seat(b: Booking, p: BookingParticipant) -> BookingParticipant:
    """Whose card pays this seat: its own, or the initiator's when the
    initiator guaranteed the seat at the deadline."""
    return initiator(b) if p.deposit_status in ("guaranteed", "declined") else p


def _capture_seat(db: Session, b: Booking, p: BookingParticipant, amount_cents: int, kind: str) -> dict:
    """Capture `amount_cents` of this seat's hold with the right Impulse fee.
    A seat whose hold lapsed (or was only ever saved) is charged off-session on
    the same card instead. Raises PaymentError when neither works."""
    venue = b.deal.venue
    intent_id = p.deposit_payment_id if (p.deposit_payment_id or "").startswith("pi_") else None
    intent = payments.retrieve_hold(intent_id) if intent_id else None

    if not intent or intent.get("status") != "requires_capture":
        payer = _payer_seat(b, p)
        customer_id = _customer_of(db, payer)
        pm = p.stripe_payment_method_id or payer.stripe_payment_method_id
        if not (customer_id and pm):
            raise PaymentNotApproved(0, "no card on file for this seat")
        intent = payments.place_offsession_hold(
            customer_id=customer_id, payment_method_id=pm, amount_cents=p.share_amount_cents,
            destination=venue_account(b),
            description=f"Impulse — {venue.name} {slot_label(b)}",
            metadata=_metadata(b, p, "rehold", shareTotalCents=p.share_amount_cents),
            idempotency_key=f"rehold-{kind}-{b.id}-{p.id}",
        )
        p.deposit_payment_id = intent["id"]

    fee = payments.impulse_fee(
        venue=venue, deposit_cents=p.deposit_cents or 0, captured_cents=amount_cents,
    )
    captured = payments.capture(
        intent_id=intent["id"], amount_cents=amount_cents, application_fee_cents=fee,
        idempotency_key=f"{kind}-{b.id}-{p.id}",
    )
    p.hold_status = "captured"
    p.balance_payment_id = captured["id"]
    return captured


def redeem(db: Session, b: Booking) -> dict:
    """Venue confirms the booking: capture each seat's hold in full (key
    balance-{bookingId}-{memberId}), then pay the venue out instantly. A failed
    capture is flagged but never blocks the rest — the booking is still
    redeemed, and the venue collects that seat directly."""
    import payouts
    venue_name = b.deal.venue.name
    results = []
    total_charged = 0
    declines = 0
    for p in share_order(b):
        share = p.share_amount_cents or 0
        payer = _payer_seat(b, p)
        name = display_name(p)
        if share <= 0 or p.deposit_status in ("settled", "refunded"):
            p.balance_status = "paid"
            results.append({"name": name, "balance_cents": 0, "status": "paid", "warning": None})
            continue
        if p.balance_status == "paid":
            total_charged += share
            results.append({"name": name, "balance_cents": share, "status": "paid", "warning": None})
            continue
        try:
            _capture_seat(db, b, p, share, "balance")
            p.balance_status = "paid"
            if payer is p:
                p.payment_note = (
                    f"Your booking at {venue_name} has been confirmed — "
                    f"{fmt_cents(share)} has been charged to your card. Enjoy!"
                )
            total_charged += share
            results.append({"name": name, "balance_cents": share, "status": "paid", "warning": None})
        except (PaymentError, HTTPException) as e:
            logger.error("Capture failed for booking %s seat %s: %s", b.id, p.id, e)
            declines += 1
            results.append({"name": name, "balance_cents": share, "status": "declined",
                            "warning": handle_decline(p, "balance", share, display_name(payer))})

    b.status = "redeemed"
    b.redeemed_at = now()
    touch(b)
    db.commit()
    logger.info("Booking %s redeemed at %s: captured %d cents, %d decline(s)", b.id, venue_name, total_charged, declines)
    if total_charged:
        payouts.pay_out_booking(db, b)
    return {"members": results, "total_charged_cents": total_charged, "declines": declines}


# ── Releasing holds (Huddle collapse / cancel) ───────────────────────────────

def refund_participants(b: Booking, reason: str) -> tuple:
    """Release every seat's own hold. Only Huddles do this: a collapsed Huddle
    never became a real booking, and a released hold costs nobody anything.
    Returns (released, failed). Kept under its old name for the routers."""
    released = failed = 0
    for p in b.participants:
        if p.deposit_status != "paid":
            continue
        try:
            if (p.deposit_payment_id or "").startswith("pi_"):
                payments.cancel_hold(intent_id=p.deposit_payment_id,
                                     idempotency_key=f"refund-{b.id}-{p.id}")
            p.deposit_status = "refunded"
            p.hold_status = "released"
            released += 1
        except PaymentError as e:
            failed += 1
            logger.error("Releasing hold failed for booking %s seat %s (%s): %s %s — needs manual follow-up",
                         b.id, p.id, reason, e.status_code, e.body)
    return released, failed


# ── Hold upkeep (runs with the deadline sweep) ───────────────────────────────

NO_SHOW_GRACE = timedelta(hours=12)
REHOLD_MARGIN = timedelta(hours=12)


def sweep_holds(db: Session) -> dict:
    """Keep holds valid until check-in and settle no-shows.

    - A seat whose card was only saved (booking was far off) gets its
      off-session hold OFFSESSION_HOLD_LEAD before the slot.
    - A hold about to lapse before an unredeemed slot is released and re-held.
    - A confirmed booking still unredeemed NO_SHOW_GRACE after its slot is a
      no-show: each seat's 10% is captured, the rest released.
    - A redeemed booking whose payout failed is retried.
    """
    import payouts
    t = now()
    counts = {"held_later": 0, "hold_failures": 0, "reheld": 0, "no_shows": 0, "payouts_retried": 0}
    live = (
        db.query(Booking)
        .options(joinedload(Booking.participants), joinedload(Booking.deal).joinedload(Deal.venue))
        .filter(Booking.status.in_(("collecting", "confirmed")))
        .all()
    )
    for b in live:
        start = slot_start(b)
        if start is None:
            continue
        if b.status == "confirmed" and t > start + NO_SHOW_GRACE:
            # Only bookings holding Stripe money are settled. Older bookings
            # (before holds existed) have nothing to capture and must keep
            # their status.
            if any(p.hold_status in ("held", "saved") for p in b.participants):
                _settle_no_show(db, b, counts)
            continue
        for p in b.participants:
            if p.deposit_status not in DEPOSIT_FIXED:
                continue
            if p.hold_status == "saved" and start - t <= payments.OFFSESSION_HOLD_LEAD:
                _hold_later(db, b, p, counts, "hold")
            elif (p.hold_status == "held" and p.hold_expires_at
                  and p.hold_expires_at - REHOLD_MARGIN < t < start):
                if (p.deposit_payment_id or "").startswith("pi_"):
                    try:
                        payments.cancel_hold(intent_id=p.deposit_payment_id,
                                             idempotency_key=f"cancel-{p.deposit_payment_id}")
                    except PaymentError as e:
                        logger.error("Releasing lapsing hold %s failed: %s", p.deposit_payment_id, e)
                        continue
                _hold_later(db, b, p, counts, f"rehold-{int(p.hold_expires_at.timestamp())}")
                counts["reheld"] += 1

    retry = (
        db.query(Booking)
        .options(joinedload(Booking.deal).joinedload(Deal.venue))
        .filter(Booking.status == "redeemed", Booking.payout_status == "failed",
                Booking.redeemed_at > t - timedelta(days=2))
        .all()
    )
    for b in retry:
        payouts.pay_out_booking(db, b)
        counts["payouts_retried"] += 1
    return counts


def _hold_later(db: Session, b: Booking, p: BookingParticipant, counts: dict, key: str) -> None:
    payer = _payer_seat(b, p)
    customer_id = _customer_of(db, payer)
    try:
        if not (customer_id and p.stripe_payment_method_id):
            raise PaymentNotApproved(0, "no card on file")
        hold = payments.place_offsession_hold(
            customer_id=customer_id, payment_method_id=p.stripe_payment_method_id,
            amount_cents=p.share_amount_cents, destination=venue_account(b),
            description=f"Impulse — {b.deal.venue.name} {slot_label(b)}",
            metadata=_metadata(b, p, "hold_later", shareTotalCents=p.share_amount_cents),
            idempotency_key=f"{key}-{b.id}-{p.id}",
        )
        p.deposit_payment_id = hold["id"]
        p.hold_status = "held"
        p.hold_expires_at = payments.hold_expires_at(hold)
        counts["held_later"] += 1
    except (PaymentError, HTTPException) as e:
        logger.error("Off-session hold failed for booking %s seat %s: %s", b.id, p.id, e)
        p.hold_status = "failed"
        p.payment_followup = True
        p.payment_note = "We couldn't hold your card for this booking — update your card in the app."
        counts["hold_failures"] += 1
    touch(b)
    db.commit()


def _settle_no_show(db: Session, b: Booking, counts: dict) -> None:
    """The group never checked in: capture each seat's 10% and release the
    rest. During the pilot that 10% goes to the venue (fee 0)."""
    import payouts
    captured_any = False
    for p in b.participants:
        if p.deposit_status not in DEPOSIT_FIXED or not p.deposit_cents:
            continue
        if p.hold_status not in ("held", "saved"):
            continue
        try:
            _capture_seat(db, b, p, p.deposit_cents, "noshow")
            captured_any = True
        except (PaymentError, HTTPException) as e:
            logger.error("No-show capture failed for booking %s seat %s: %s", b.id, p.id, e)
            p.payment_followup = True
    b.status = "no_show"
    touch(b)
    db.commit()
    counts["no_shows"] += 1
    logger.info("Booking %s marked no-show", b.id)
    if captured_any:
        payouts.pay_out_booking(db, b)


# ── Push ─────────────────────────────────────────────────────────────────────

def member_push_tokens(db: Session, participants: Sequence[BookingParticipant]) -> dict:
    """user_id → expo push token for participants that have one. Never
    raises — a failed lookup must not break the flow that's pushing."""
    user_ids = [p.user_id for p in participants if p.user_id]
    if not user_ids:
        return {}
    try:
        rows = (
            db.query(User.id, User.expo_push_token)
            .filter(User.id.in_(user_ids), User.expo_push_token.isnot(None))
            .all()
        )
        return {str(uid): token for uid, token in rows}
    except Exception:
        logger.exception("Push token lookup failed for %d user(s)", len(user_ids))
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
        · Huddle: some seats held → release each hold (refund-{b}-{m}),
          collapsed; none held → expired. Spots go back to the deal.
        · Direct: unpaid seats fall to the initiator (guarantor-{b}-{m}) and
          the code issues regardless.
    - Then hold upkeep and no-shows (sweep_holds).
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
    counts.update(sweep_holds(db))
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
    push_all(db, b, "Plan expired", "The group didn't all pay in time — the hold on your card has been released.", "huddle_collapsed")
    counts["collapsed"] += 1
    logger.info("Booking %s collapsed (share deadline), released %d hold(s)", b.id, len(paid))


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
    import live_activity
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
        live_activity=live_activity.view_props(b, me),
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
                         "data": push_data(b, "split_confirmed"), **push.URGENT})
    if messages:
        push.send_push_many(messages)


def push_invite(db: Session, b: Booking, p: BookingParticipant) -> None:
    """The invitee hears about it the way they'd hear from a friend."""
    token = member_push_tokens(db, [p]).get(p.user_id or "")
    if not token:
        logger.info("Seat invite on booking %s: invitee %s has no push token (notifications off or never registered)",
                    b.id, p.user_id)
        return
    venue = b.deal.venue.name if b.deal and b.deal.venue else "somewhere"
    push.send_push_many([{
        "to": token,
        "title": f"{display_name(initiator(b))} saved you a spot",
        "body": f"{venue}, {slot_label(b)} — your share is {fmt_cents(p.share_amount_cents or 0)}",
        "data": push_data(b, "seat_invite"),
        # Expands into Pay now / Can't make it — the app registers this
        # category (mobile src/pushRouting.ts).
        "categoryId": "seat_invite",
        **push.URGENT,
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
