import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sa_func, or_, text
from sqlalchemy.orm import Session, joinedload

import payments
import push
from auth import get_current_user, get_optional_user
from database import get_db
from huddle_logic import compute_shares, deal_cutoff, resolve_borda
from models import Booking, Deal, Huddle, HuddleMember, User
from pinch_client import PinchError
from schemas import (
    BallotSubmit,
    DealWithVenueResponse,
    HuddleCreate,
    HuddleJoin,
    HuddleJoinResponse,
    HuddleMemberPublic,
    HuddlePay,
    HuddleRedeemMemberResult,
    HuddleRedeemResponse,
    HuddleResponse,
    HuddleShare,
    HuddleVerifyMember,
    HuddleVerifyResponse,
)

router = APIRouter()
logger = logging.getLogger("impulse.huddles")

PINCH_MERCHANT_ID: str = os.environ["PINCH_TEST_MERCHANT_ID"]

MIN_GROUP = 2
MAX_GROUP = 10
# Fallback voting window when no candidate deal carries an expiry.
DEFAULT_VOTING_WINDOW = timedelta(hours=2)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def candidate_deals(db: Session, group_size: int):
    """Live deals the whole group can actually attend: active, enough spots,
    a max_group_size that fits N, and not already expired."""
    now = _now()
    return (
        db.query(Deal)
        .filter(
            Deal.is_active == True,
            Deal.spots_remaining >= group_size,
            Deal.max_group_size >= group_size,
            or_(Deal.expires_at.is_(None), Deal.expires_at > now),
        )
        .all()
    )


def _cutoff(deal: Deal) -> Optional[datetime]:
    """Deal's drop-dead time (expires_at or last slot − 1h), tz-aware UTC.
    Slot texts are naive local times; treated as UTC — consistent for
    comparisons since every deal is parsed the same way."""
    c = deal_cutoff(deal.expires_at, deal.date, deal.slots or [])
    if c is None:
        return None
    return c if c.tzinfo else c.replace(tzinfo=timezone.utc)


def _voting_deadline(deals: list) -> datetime:
    """Soonest *future* candidate cutoff (deal expiry or last-slot−1h) — voting
    stays open until the earliest option would actually expire. Only future
    cutoffs count, so an already-expired deal can't time the huddle out
    immediately. Falls back to a default window only when no deal carries a
    cutoff at all."""
    now = _now()
    future_cutoffs = [c for d in deals if (c := _cutoff(d)) is not None and c > now]
    return min(future_cutoffs) if future_cutoffs else now + DEFAULT_VOTING_WINDOW


def _member_public(m: HuddleMember, creator_member_id: Optional[str]) -> HuddleMemberPublic:
    return HuddleMemberPublic(
        id=m.id,
        display_name=m.display_name,
        is_creator=m.id == creator_member_id,
        has_voted=m.ballot_at is not None,
        deposit_status=m.deposit_status,
        balance_status=m.balance_status,
    )


def share_order(h: Huddle) -> List[HuddleMember]:
    """Deterministic member order for share math: creator first (absorbs the
    rounding remainder), then everyone else by join time."""
    members = sorted(h.members, key=lambda m: (m.joined_at, m.id))
    creator = [m for m in members if m.id == h.creator_member_id]
    rest = [m for m in members if m.id != h.creator_member_id]
    return creator + rest


def member_share(h: Huddle, deal: Deal, member: HuddleMember) -> dict:
    """This member's exact share of the winning deal. Pure function of
    (deal price, group size, member order) — stable across calls, so the
    amount shown is always the amount charged."""
    total_cents = int(round(float(deal.deal_price) * h.group_size * 100))
    shares = compute_shares(total_cents, h.group_size)
    ordered = share_order(h)
    idx = next(i for i, m in enumerate(ordered) if m.id == member.id)
    return shares[idx]


def _huddle_response(h: Huddle, me: Optional[HuddleMember] = None) -> HuddleResponse:
    members = sorted(h.members, key=lambda m: (m.joined_at, m.id))
    my_share = None
    winning_deal = None
    if h.winning_deal_id and h.winning_deal:
        winning_deal = DealWithVenueResponse.from_deal(h.winning_deal)
        if me is not None:
            my_share = HuddleShare(**member_share(h, h.winning_deal, me))
    return HuddleResponse(
        id=h.id,
        status=h.status,
        group_size=h.group_size,
        join_token=h.join_token,
        voting_deadline=h.voting_deadline,
        payment_deadline=h.payment_deadline,
        winning_deal_id=h.winning_deal_id,
        common_code=h.common_code if h.status in ("active", "redeemed") else None,
        members=[_member_public(m, h.creator_member_id) for m in members],
        created_at=h.created_at,
        my_member_id=me.id if me else None,
        my_has_voted=bool(me.ballot_at) if me else False,
        my_share=my_share,
        winning_deal=winning_deal,
    )


def _load_huddle(db: Session, huddle_id: str) -> Huddle:
    h = (
        db.query(Huddle)
        .options(
            joinedload(Huddle.members),
            joinedload(Huddle.winning_deal).joinedload(Deal.venue),
        )
        .filter(Huddle.id == huddle_id)
        .first()
    )
    if not h:
        raise HTTPException(status_code=404, detail="Huddle not found")
    return h


def require_member(
    h: Huddle,
    user: Optional[dict],
    member_token: Optional[str],
) -> HuddleMember:
    """Resolve the caller's seat: a signed-in member's user id, or a guest's
    member_token. Anyone else gets a 403."""
    if member_token:
        for m in h.members:
            if m.member_token == member_token:
                return m
    if user:
        for m in h.members:
            if m.user_id == user["sub"]:
                return m
    raise HTTPException(status_code=403, detail="Not a member of this huddle")


def touch(h: Huddle) -> None:
    """Bump updated_at — the realtime poke that tells members to refetch."""
    h.updated_at = sa_func.now()


@router.post("", response_model=HuddleJoinResponse, status_code=201)
def create_huddle(
    body: HuddleCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Signed-in user starts a huddle and takes the first seat."""
    if not (MIN_GROUP <= body.group_size <= MAX_GROUP):
        raise HTTPException(status_code=400, detail=f"group_size must be {MIN_GROUP}–{MAX_GROUP}")

    deals = candidate_deals(db, body.group_size)
    if not deals:
        raise HTTPException(
            status_code=409,
            detail=f"No live deals can fit a group of {body.group_size} right now",
        )

    profile = db.query(User).filter(User.id == user["sub"]).first()
    # Prefer the name the client sends (its computed display name), then the
    # profile's full name, then the email's local part as a username, then a
    # neutral fallback — never a role label like "Creator".
    email_username = (profile.email.split("@")[0] if profile and profile.email else None)
    display_name = (
        (body.display_name or "").strip()
        or (profile.full_name.strip() if profile and profile.full_name else None)
        or email_username
        or "You"
    )[:40]

    huddle = Huddle(
        group_size=body.group_size,
        join_token=secrets.token_urlsafe(9),
        voting_deadline=_voting_deadline(deals),
    )
    db.add(huddle)
    db.flush()

    creator = HuddleMember(
        huddle_id=huddle.id,
        user_id=user["sub"],
        display_name=display_name,
        member_token=secrets.token_urlsafe(16),
    )
    db.add(creator)
    db.flush()
    huddle.creator_member_id = creator.id
    db.commit()

    h = _load_huddle(db, huddle.id)
    me = next(m for m in h.members if m.id == creator.id)
    return HuddleJoinResponse(huddle=_huddle_response(h, me), member_id=creator.id, member_token=creator.member_token)


@router.post("/join/{join_token}", response_model=HuddleJoinResponse)
def join_huddle(
    join_token: str,
    body: HuddleJoin,
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Join via the shared link/QR token. Signed-in users keep their seat across
    repeat joins; guests (no account) get a seat + member_token."""
    huddle = (
        db.query(Huddle)
        .options(joinedload(Huddle.members))
        .filter(Huddle.join_token == join_token)
        .with_for_update(of=Huddle)
        .first()
    )
    if not huddle:
        raise HTTPException(status_code=404, detail="Huddle not found")
    if huddle.status != "open":
        raise HTTPException(status_code=409, detail=f"Huddle is no longer joinable (status={huddle.status})")
    if huddle.voting_deadline and _now() > huddle.voting_deadline:
        raise HTTPException(status_code=409, detail="This huddle's voting window has closed")

    # Duplicate join → same seat.
    if user:
        for m in huddle.members:
            if m.user_id == user["sub"]:
                return HuddleJoinResponse(
                    huddle=_huddle_response(huddle, m), member_id=m.id, member_token=m.member_token,
                )

    if len(huddle.members) >= huddle.group_size:
        raise HTTPException(status_code=409, detail="Huddle is full")

    display_name = (body.display_name or "").strip()
    if not display_name and user:
        profile = db.query(User).filter(User.id == user["sub"]).first()
        display_name = (profile.full_name if profile and profile.full_name else None) or ""
    if not display_name:
        raise HTTPException(status_code=400, detail="display_name is required")

    member = HuddleMember(
        huddle_id=huddle.id,
        user_id=user["sub"] if user else None,
        display_name=display_name[:40],
        member_token=secrets.token_urlsafe(16),
    )
    db.add(member)
    touch(huddle)
    db.commit()

    h = _load_huddle(db, huddle.id)
    me = next(m for m in h.members if m.id == member.id)
    return HuddleJoinResponse(huddle=_huddle_response(h, me), member_id=member.id, member_token=member.member_token)


@router.get("/{huddle_id}", response_model=HuddleResponse)
def get_huddle(
    huddle_id: str,
    member_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Member view: status + avatar states (joined/voted/paid). Ballots sealed."""
    h = _load_huddle(db, huddle_id)
    me = require_member(h, user, member_token)
    return _huddle_response(h, me)


@router.get("/{huddle_id}/candidates", response_model=List[DealWithVenueResponse])
def huddle_candidates(
    huddle_id: str,
    member_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """The ballot: live deals the whole group can attend."""
    h = _load_huddle(db, huddle_id)
    require_member(h, user, member_token)
    deals = (
        db.query(Deal)
        .options(joinedload(Deal.venue))
        .filter(
            Deal.is_active == True,
            Deal.spots_remaining >= h.group_size,
            Deal.max_group_size >= h.group_size,
            or_(Deal.expires_at.is_(None), Deal.expires_at > _now()),
        )
        .all()
    )
    return [DealWithVenueResponse.from_deal(d) for d in deals]


def _member_push_tokens(db: Session, members: List[HuddleMember]) -> dict:
    """user_id → expo push token for members that have one. Defensive raw SQL:
    returns {} until the expo_push_token column has been migrated."""
    user_ids = [m.user_id for m in members if m.user_id]
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


def _resolve_huddle(db: Session, h: Huddle) -> None:
    """All ballots are in: run Borda, set the winner and payment deadline,
    move to awaiting_payment, and push each member their share amount."""
    candidates = candidate_deals(db, h.group_size)
    cutoffs = {d.id: (_cutoff(d).replace(tzinfo=None) if _cutoff(d) else None) for d in candidates}
    ballots = [m.ballot or [] for m in h.members]
    winner_id = resolve_borda(ballots, cutoffs)
    if winner_id is None:
        # Every pick died before resolution (deals expired/filled). Terminal.
        h.status = "expired"
        touch(h)
        db.commit()
        return

    winner = next(d for d in candidates if d.id == winner_id)
    h.winning_deal_id = winner.id
    h.status = "awaiting_payment"
    # Never in the past — a past cutoff would collapse the huddle immediately.
    _wc = _cutoff(winner)
    _pn = _now()
    h.payment_deadline = _wc if (_wc is not None and _wc > _pn) else (_pn + DEFAULT_VOTING_WINDOW)
    touch(h)
    db.commit()
    db.refresh(h)

    # Push "It's decided" to every member with a token, with their own share.
    tokens = _member_push_tokens(db, h.members)
    slot_label = f"{winner.date} {(winner.slots or [''])[0]}".strip()
    messages = []
    for m in h.members:
        token = tokens.get(m.user_id or "")
        if not token:
            continue
        share = member_share(h, winner, m)
        messages.append({
            "to": token,
            "title": "It's decided!",
            "body": (
                f"{winner.venue.name} {slot_label} — pay your "
                f"${share['deposit_cents'] / 100:.2f} to activate your group code"
            ),
            "data": {"huddleId": h.id, "type": "huddle_resolved"},
        })
    if messages:
        push.send_push_many(messages)
    logger.info(
        "Huddle %s resolved → deal %s (%s), %d push message(s)",
        h.id, winner.id, winner.title, len(messages),
    )


@router.post("/{huddle_id}/ballot", response_model=HuddleResponse)
def submit_ballot(
    huddle_id: str,
    body: BallotSubmit,
    member_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Member submits their ranked top picks (best first, up to 3). Ballots are
    sealed — stored server-side, never returned to anyone. Re-submitting before
    resolution overwrites your own ballot. The final ballot triggers resolution."""
    h = _load_huddle(db, huddle_id)
    me = require_member(h, user, member_token)

    if h.status != "open":
        raise HTTPException(status_code=409, detail=f"Voting is closed (status={h.status})")
    if h.voting_deadline and _now() > h.voting_deadline:
        raise HTTPException(status_code=409, detail="The voting deadline has passed")

    picks = [p for i, p in enumerate(body.picks) if p not in body.picks[:i]]  # dedupe, keep order
    if not (1 <= len(picks) <= 3):
        raise HTTPException(status_code=400, detail="Pick 1–3 deals, best first")

    valid_ids = {d.id for d in candidate_deals(db, h.group_size)}
    invalid = [p for p in picks if p not in valid_ids]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail="Some picks are no longer available for this group size",
        )

    me.ballot = picks
    me.ballot_at = sa_func.now()
    touch(h)
    db.commit()
    db.refresh(h)

    # Async voting: the huddle resolves the moment the Nth ballot lands —
    # members don't need to be simultaneously present (or even all joined yet
    # when earlier ballots come in).
    voted = sum(1 for m in h.members if m.ballot_at is not None)
    if len(h.members) == h.group_size and voted == h.group_size:
        _resolve_huddle(db, h)
        h = _load_huddle(db, huddle_id)
        me = next(m for m in h.members if m.id == me.id)

    return _huddle_response(h, me)


def _generate_common_code(db: Session) -> str:
    """A 6-digit group code, unique across huddles AND single-booking codes so
    the one venue verification screen can never confuse the two."""
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    for _ in range(10):
        clash = (
            db.query(Huddle).filter(Huddle.common_code == code).first()
            or db.query(Booking).filter(Booking.confirmation_code == code).first()
        )
        if not clash:
            return code
        code = "".join(secrets.choice("0123456789") for _ in range(6))
    return code


def _activate_huddle(db: Session, h: Huddle) -> None:
    """Last deposit share is in: mint the shared code, go active, and push the
    code to every member."""
    h.common_code = _generate_common_code(db)
    h.status = "active"
    touch(h)
    db.commit()
    db.refresh(h)

    venue_name = h.winning_deal.venue.name if h.winning_deal and h.winning_deal.venue else "the venue"
    tokens = _member_push_tokens(db, h.members)
    messages = []
    for m in h.members:
        token = tokens.get(m.user_id or "")
        if not token:
            continue
        messages.append({
            "to": token,
            "title": "Your group is confirmed! 🎉",
            "body": f"Show code {h.common_code} at {venue_name}. Your balance is charged when it's scanned.",
            "data": {"huddleId": h.id, "type": "huddle_active", "code": h.common_code},
        })
    if messages:
        push.send_push_many(messages)
    logger.info("Huddle %s activated with code %s (%d confirmation push(es))", h.id, h.common_code, len(messages))


@router.post("/{huddle_id}/pay", response_model=HuddleResponse)
def pay_huddle_share(
    huddle_id: str,
    body: HuddlePay,
    member_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Member pays their deposit share of the winning deal via Pinch. Vaults the
    member's card (once), then charges exactly the deposit share they were shown.
    Reuses the shared deposit orchestration; nonce deposit-{huddleId}-{memberId}."""
    h = _load_huddle(db, huddle_id)
    me = require_member(h, user, member_token)

    if h.status != "awaiting_payment":
        raise HTTPException(status_code=409, detail=f"Huddle is not awaiting payment (status={h.status})")
    if me.deposit_status == "paid":
        raise HTTPException(status_code=409, detail="You've already paid your share")
    if h.payment_deadline and _now() > h.payment_deadline:
        raise HTTPException(status_code=409, detail="The payment deadline has passed")
    if not h.winning_deal:
        raise HTTPException(status_code=409, detail="Huddle has no winning deal")

    # The amount charged is exactly the share computed for this member — the same
    # value surfaced in the huddle response the member saw before paying.
    share = member_share(h, h.winning_deal, me)
    deposit_cents = share["deposit_cents"]
    slot = f"{h.winning_deal.date} {(h.winning_deal.slots or [''])[0]}".strip()

    try:
        # Vault the member's card once (reuse on retry if already vaulted).
        if not (me.pinch_payer_id and me.pinch_source_id):
            me.pinch_payer_id, me.pinch_source_id = payments.vault_card(
                first_name=body.first_name,
                last_name=body.last_name,
                email=body.email,
                token=body.token,
                merchant_id=PINCH_MERCHANT_ID,
            )
        payment = payments.charge_deposit(
            payer_id=me.pinch_payer_id,
            source_id=me.pinch_source_id,
            amount_cents=deposit_cents,
            description=f"Impulse huddle deposit — {h.winning_deal.venue.name} {slot}",
            metadata={
                "impulseHuddleId": h.id,
                "impulseMemberId": me.id,
                "type": "huddle_deposit",
                "depositAmountCents": deposit_cents,
                "balanceAmountCents": share["balance_cents"],
                "shareTotalCents": share["total_cents"],
            },
            nonce=f"deposit-{h.id}-{me.id}",
            merchant_id=PINCH_MERCHANT_ID,
        )
    except PinchError as e:
        db.rollback()
        logger.error("Huddle %s deposit failed for member %s: %s %s", h.id, me.id, e.status_code, e.body)
        raise HTTPException(status_code=402, detail=f"Deposit payment failed: {e.body}")

    me.deposit_payment_id = payment["id"]
    me.deposit_status = "paid"
    touch(h)
    db.commit()

    h = _load_huddle(db, huddle_id)
    me = next(m for m in h.members if m.id == me.id)
    paid = sum(1 for m in h.members if m.deposit_status == "paid")
    logger.info("Huddle %s: member %s paid deposit share (%d/%d paid)", h.id, me.id, paid, h.group_size)

    # Last share in → activate the shared code and push it to everyone.
    if h.status == "awaiting_payment" and paid == h.group_size:
        _activate_huddle(db, h)
        h = _load_huddle(db, huddle_id)
        me = next(m for m in h.members if m.id == me.id)

    return _huddle_response(h, me)


def _load_by_code(db: Session, code: str) -> Huddle:
    h = (
        db.query(Huddle)
        .options(
            joinedload(Huddle.members),
            joinedload(Huddle.winning_deal).joinedload(Deal.venue),
        )
        .filter(Huddle.common_code == code)
        .first()
    )
    if not h:
        raise HTTPException(status_code=404, detail="Huddle code not found")
    return h


def _authorize_venue(h: Huddle, user: dict) -> None:
    venue = h.winning_deal.venue if h.winning_deal else None
    if not venue or venue.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized for this venue")


@router.get("/verify/{code}", response_model=HuddleVerifyResponse)
def verify_huddle_code(
    code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Venue: preview a group code before charging — group size, member names,
    and the total balance about to be collected. No money moves here."""
    h = _load_by_code(db, code)
    _authorize_venue(h, user)

    ordered = share_order(h)
    members = [
        HuddleVerifyMember(
            name=m.display_name,
            balance_cents=member_share(h, h.winning_deal, m)["balance_cents"],
            balance_status=m.balance_status,
        )
        for m in ordered
    ]
    slot = f"{h.winning_deal.date} {(h.winning_deal.slots or [''])[0]}".strip()
    return HuddleVerifyResponse(
        huddle_id=h.id,
        group_size=h.group_size,
        venue_name=h.winning_deal.venue.name,
        deal_title=h.winning_deal.title,
        slot=slot,
        total_balance_cents=sum(m.balance_cents for m in members),
        members=members,
        status=h.status,
        already_redeemed=h.status == "redeemed",
    )


@router.post("/redeem/{code}", response_model=HuddleRedeemResponse)
def redeem_huddle_code(
    code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Venue: confirm the group. Fires one balance charge per member's vaulted
    card (nonce balance-{huddleId}-{memberId}, 20% applicationFee). A per-member
    decline is flagged but never blocks the rest — the group is still redeemed."""
    h = _load_by_code(db, code)
    _authorize_venue(h, user)

    if h.status == "redeemed":
        raise HTTPException(status_code=409, detail="This group code was already redeemed")
    if h.status != "active":
        raise HTTPException(status_code=409, detail=f"Group code is not active (status={h.status})")

    venue_name = h.winning_deal.venue.name
    slot = f"{h.winning_deal.date} {(h.winning_deal.slots or [''])[0]}".strip()

    results: List[HuddleRedeemMemberResult] = []
    total_charged = 0
    declines = 0

    for m in share_order(h):
        balance_cents = member_share(h, h.winning_deal, m)["balance_cents"]
        if balance_cents <= 0:
            m.balance_status = "paid"
            results.append(HuddleRedeemMemberResult(name=m.display_name, balance_cents=0, status="paid"))
            continue
        if m.balance_status == "paid":
            # Idempotent: already charged on a prior attempt.
            total_charged += balance_cents
            results.append(HuddleRedeemMemberResult(name=m.display_name, balance_cents=balance_cents, status="paid"))
            continue
        try:
            payment = payments.charge_balance(
                payer_id=m.pinch_payer_id,
                source_id=m.pinch_source_id,
                amount_cents=balance_cents,
                application_fee_cents=round(balance_cents * 0.20),
                description=f"Impulse huddle balance — {venue_name} {slot}",
                metadata={
                    "impulseHuddleId": h.id,
                    "impulseMemberId": m.id,
                    "type": "huddle_balance",
                    "balanceAmountCents": balance_cents,
                },
                nonce=f"balance-{h.id}-{m.id}",
                merchant_id=PINCH_MERCHANT_ID,
            )
            m.balance_payment_id = payment["id"]
            m.balance_status = "paid"
            total_charged += balance_cents
            results.append(HuddleRedeemMemberResult(name=m.display_name, balance_cents=balance_cents, status="paid"))
        except PinchError as e:
            logger.error("Huddle %s balance charge failed for member %s: %s %s", h.id, m.id, e.status_code, e.body)
            m.balance_status = "declined"
            declines += 1
            results.append(HuddleRedeemMemberResult(
                name=m.display_name,
                balance_cents=balance_cents,
                status="declined",
                warning=f"Card declined — collect ${balance_cents / 100:.2f} from {m.display_name} directly",
            ))

    # Redemption completes regardless of declines.
    h.status = "redeemed"
    touch(h)
    db.commit()

    logger.info("Huddle %s redeemed at %s: charged %d cents, %d decline(s)", h.id, venue_name, total_charged, declines)
    return HuddleRedeemResponse(
        huddle_id=h.id,
        redeemed=True,
        members=results,
        total_charged_cents=total_charged,
        declines=declines,
    )


def _push_all(db: Session, h: Huddle, title: str, body: str, event_type: str) -> None:
    """Push the same message to every member of a huddle that has a token."""
    tokens = _member_push_tokens(db, h.members)
    messages = [
        {"to": tokens[m.user_id], "title": title, "body": body,
         "data": {"huddleId": h.id, "type": event_type}}
        for m in h.members if m.user_id and tokens.get(m.user_id)
    ]
    if messages:
        push.send_push_many(messages)


def sweep_deadlines(db: Session) -> dict:
    """Move huddles past their deadlines into a terminal state. Runs on a timer
    (see main.py) and is also runnable as a one-shot script (sweep_huddles.py).

    - Voting deadline passed while still `open` (never resolved) → `expired`,
      "nobody was charged" (no money ever moved).
    - Payment deadline passed while `awaiting_payment`:
        · some deposits paid → refund each paid deposit (nonce refund-{h}-{m}),
          status `collapsed`, "you've been refunded".
        · none paid → `expired`, "nobody was charged".

    NOTE: this refund is a plan-collapse rollback, distinct from the
    single-booking rule that confirmed deposits are non-refundable — a collapsed
    huddle never became a real booking.
    """
    now = _now()
    counts = {"expired_voting": 0, "collapsed": 0, "expired_payment": 0, "refund_failures": 0}

    open_expired = (
        db.query(Huddle)
        .options(joinedload(Huddle.members))
        .filter(Huddle.status == "open", Huddle.voting_deadline.isnot(None), Huddle.voting_deadline < now)
        .all()
    )
    for h in open_expired:
        h.status = "expired"
        touch(h)
        db.commit()
        _push_all(db, h, "Plan expired", "Your huddle didn't fill up in time — nobody was charged.", "huddle_expired")
        counts["expired_voting"] += 1
        logger.info("Huddle %s expired (voting deadline)", h.id)

    pay_expired = (
        db.query(Huddle)
        .options(joinedload(Huddle.members), joinedload(Huddle.winning_deal).joinedload(Deal.venue))
        .filter(Huddle.status == "awaiting_payment", Huddle.payment_deadline.isnot(None), Huddle.payment_deadline < now)
        .all()
    )
    for h in pay_expired:
        paid = [m for m in h.members if m.deposit_status == "paid"]
        if not paid and not any(m.deposit_status == "refunded" for m in h.members):
            h.status = "expired"
            touch(h)
            db.commit()
            _push_all(db, h, "Plan expired", "The group didn't all pay in time — nobody was charged.", "huddle_expired")
            counts["expired_payment"] += 1
            logger.info("Huddle %s expired (payment deadline, no payments)", h.id)
            continue

        for m in paid:
            try:
                payments.refund_full(
                    payment_id=m.deposit_payment_id,
                    reason="Impulse huddle plan expired",
                    nonce=f"refund-{h.id}-{m.id}",
                    merchant_id=PINCH_MERCHANT_ID,
                )
                m.deposit_status = "refunded"
            except PinchError as e:
                counts["refund_failures"] += 1
                logger.error("Huddle %s refund failed for member %s: %s %s — needs manual follow-up",
                             h.id, m.id, e.status_code, e.body)
        h.status = "collapsed"
        touch(h)
        db.commit()
        _push_all(db, h, "Plan expired", "The group didn't all pay in time — you've been refunded.", "huddle_collapsed")
        counts["collapsed"] += 1
        logger.info("Huddle %s collapsed (payment deadline), refunded %d member(s)", h.id, len(paid))

    return counts
