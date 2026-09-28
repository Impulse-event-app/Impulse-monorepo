import logging
import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sa_func, or_
from sqlalchemy.orm import Session, joinedload

import booking_flow as flow
import push
from auth import get_current_user
from booking_logic import deal_cutoff, resolve_borda
from database import get_db
from models import Booking, BookingParticipant, Deal
from routers.bookings import ensure_user_row, profile_name
from schemas import BallotSubmit, BookingView, DealWithVenueResponse, HuddleCreate, HuddleJoin

router = APIRouter()
logger = logging.getLogger("impulse.huddles")

# A Huddle is a booking with a voting stage. This router owns that stage —
# create, join, candidates, ballots, resolution, cancel. Once the winner is
# picked everything else (split, shares, payment, code, redemption, deadline)
# is the shared booking path: /bookings/{id}/split, /pay, /verify, /redeem.

MIN_GROUP = 2
MAX_GROUP = 10
# Fallback voting window when no candidate deal carries an expiry.
DEFAULT_VOTING_WINDOW = timedelta(hours=2)


def _now():
    return flow.now()


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
    """Deal's drop-dead time (expires_at or last slot − 1h), aware UTC, with
    slot times read in the venue's local time zone."""
    return deal_cutoff(deal.expires_at, deal.date, deal.slots or [])


def _voting_deadline(deals: list) -> datetime:
    """Soonest *future* candidate cutoff (deal expiry or last-slot−1h) — voting
    stays open until the earliest option would actually expire. Only future
    cutoffs count, so an already-expired deal can't time the huddle out
    immediately. Falls back to a default window only when no deal carries a
    cutoff at all."""
    now = _now()
    future_cutoffs = [c for d in deals if (c := _cutoff(d)) is not None and c > now]
    return min(future_cutoffs) if future_cutoffs else now + DEFAULT_VOTING_WINDOW


def _load(db: Session, huddle_id: str, *, lock: bool = False) -> Booking:
    b = flow.load(db, huddle_id, lock=lock)
    if not b.has_voting:
        raise HTTPException(status_code=404, detail="Huddle not found")
    return b


@router.post("", response_model=BookingView, status_code=201)
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

    ensure_user_row(db, user)
    b = Booking(
        user_id=user["sub"],
        num_people=body.group_size,
        total_paid=0,
        status="voting",
        has_voting=True,
        join_token=secrets.token_urlsafe(9),
        voting_deadline=_voting_deadline(deals),
    )
    db.add(b)
    db.flush()
    creator = BookingParticipant(
        booking_id=b.id,
        user_id=user["sub"],
        display_name=profile_name(db, user, body.display_name),
        claimed_at=_now(),
        joined_at=_now(),
    )
    db.add(creator)
    db.flush()
    b.initiator_member_id = creator.id
    db.commit()

    b = _load(db, b.id)
    return flow.view(b, flow.member_of(b, user))


@router.post("/join/{join_token}", response_model=BookingView)
def join_huddle(
    join_token: str,
    body: HuddleJoin,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Join via the shared link/QR token. Repeat joins keep the same seat."""
    b = (
        db.query(Booking)
        .options(joinedload(Booking.participants))
        .filter(Booking.join_token == join_token, Booking.has_voting == True)
        .with_for_update(of=Booking)
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Huddle not found")

    mine = next((p for p in b.participants if p.user_id == user["sub"]), None)
    if mine:
        return flow.view(_load(db, b.id), mine)

    if b.status != "voting":
        raise HTTPException(status_code=409, detail=f"Huddle is no longer joinable (status={b.status})")
    if b.voting_deadline and _now() > b.voting_deadline:
        raise HTTPException(status_code=409, detail="This huddle's voting window has closed")
    if len(b.participants) >= b.num_people:
        raise HTTPException(status_code=409, detail="Huddle is full")

    ensure_user_row(db, user)
    member = BookingParticipant(
        booking_id=b.id,
        user_id=user["sub"],
        display_name=profile_name(db, user, body.display_name),
        claimed_at=_now(),
        joined_at=_now(),
    )
    db.add(member)
    flow.touch(b)
    db.commit()

    b = _load(db, b.id)
    return flow.view(b, flow.member_of(b, user))


@router.get("/{huddle_id}", response_model=BookingView)
def get_huddle(
    huddle_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Member view: status + avatar states (joined/voted/paid). Ballots sealed."""
    b = _load(db, huddle_id)
    return flow.view(b, flow.member_of(b, user))


@router.get("/{huddle_id}/candidates", response_model=List[DealWithVenueResponse])
def huddle_candidates(
    huddle_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """The ballot: live deals the whole group can attend."""
    b = _load(db, huddle_id)
    flow.member_of(b, user)
    deals = (
        db.query(Deal)
        .options(joinedload(Deal.venue))
        .filter(
            Deal.is_active == True,
            Deal.spots_remaining >= b.num_people,
            Deal.max_group_size >= b.num_people,
            or_(Deal.expires_at.is_(None), Deal.expires_at > _now()),
        )
        .all()
    )
    return [DealWithVenueResponse.from_deal(d) for d in deals]


def _resolve_huddle(db: Session, b: Booking) -> None:
    """All ballots are in: run Borda, then hand over to the shared booking
    path — lock the winner's price and spots, set the share deadline, and
    start from an even split. Shares are collected once the creator has
    confirmed the split (PATCH /bookings/{id}/split)."""
    candidates = candidate_deals(db, b.num_people)
    cutoffs = {d.id: (_cutoff(d).replace(tzinfo=None) if _cutoff(d) else None) for d in candidates}
    ballots = [p.ballot or [] for p in b.participants]
    winner_id = resolve_borda(ballots, cutoffs)
    if winner_id is None:
        # Every pick died before resolution (deals expired/filled). Terminal.
        b.status = "expired"
        flow.touch(b)
        db.commit()
        return

    winner = next(d for d in candidates if d.id == winner_id)
    b.deal_id = winner.id
    b.deal = winner
    b.slot_time = (winner.slots or [None])[0]
    flow.lock_price(b, winner)
    try:
        flow.lock_spots(db, b)
    except HTTPException:
        db.rollback()
        b = _load(db, b.id)
        b.status = "expired"
        flow.touch(b)
        db.commit()
        flow.push_all(db, b, "Plan expired", "The winning deal filled up — nobody was charged.", "huddle_expired")
        return
    # Never in the past — a past cutoff would collapse the huddle immediately.
    wc = _cutoff(winner)
    pn = _now()
    b.share_deadline = wc if (wc is not None and wc > pn) else (pn + DEFAULT_VOTING_WINDOW)
    b.status = "collecting"
    flow.even_shares(b)
    flow.touch(b)
    db.commit()
    db.refresh(b)

    slot = flow.slot_label(b)
    ini = flow.initiator(b)
    tokens = flow.member_push_tokens(db, b.participants)
    messages = []
    for p in b.participants:
        token = tokens.get(p.user_id or "")
        if not token:
            continue
        body = (
            f"{winner.venue.name} {slot} — choose how to split it"
            if p.id == ini.id else
            f"{winner.venue.name} {slot} — {flow.display_name(ini)} is sorting the split"
        )
        messages.append({"to": token, "title": "It's decided!", "body": body,
                         "data": flow.push_data(b, "huddle_resolved")})
    if messages:
        push.send_push_many(messages)
    logger.info("Huddle %s resolved → deal %s (%s), %d push message(s)",
                b.id, winner.id, winner.title, len(messages))


@router.post("/{huddle_id}/ballot", response_model=BookingView)
def submit_ballot(
    huddle_id: str,
    body: BallotSubmit,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Member submits their ranked top picks (best first, up to 3). Ballots are
    sealed — stored server-side, never returned to anyone. Re-submitting before
    resolution overwrites your own ballot. The final ballot triggers resolution."""
    b = _load(db, huddle_id, lock=True)
    me = flow.member_of(b, user)

    if b.status != "voting":
        raise HTTPException(status_code=409, detail=f"Voting is closed (status={b.status})")
    if b.voting_deadline and _now() > b.voting_deadline:
        raise HTTPException(status_code=409, detail="The voting deadline has passed")

    picks = [p for i, p in enumerate(body.picks) if p not in body.picks[:i]]  # dedupe, keep order
    if not (1 <= len(picks) <= 3):
        raise HTTPException(status_code=400, detail="Pick 1–3 deals, best first")

    valid_ids = {d.id for d in candidate_deals(db, b.num_people)}
    if any(p not in valid_ids for p in picks):
        raise HTTPException(status_code=400, detail="Some picks are no longer available for this group size")

    me.ballot = picks
    me.ballot_at = sa_func.now()
    flow.touch(b)
    db.commit()
    db.refresh(b)

    # Async voting: the huddle resolves the moment the Nth ballot lands.
    voted = sum(1 for p in b.participants if p.ballot_at is not None)
    if len(b.participants) == b.num_people and voted == b.num_people:
        _resolve_huddle(db, b)

    b = _load(db, huddle_id)
    return flow.view(b, flow.member_of(b, user))


@router.post("/{huddle_id}/cancel", response_model=BookingView)
def cancel_huddle(
    huddle_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Creator calls off the huddle. Before it's confirmed this is a clean
    cancel: nothing was charged while voting; any deposit shares paid while
    collecting are refunded through the shared refund path (the plan never
    became a real booking) and the spots go back. A confirmed huddle can't be
    cancelled."""
    b = _load(db, huddle_id, lock=True)
    me = flow.member_of(b, user)

    if me.id != b.initiator_member_id:
        raise HTTPException(status_code=403, detail="Only the huddle creator can cancel it")
    if b.status in ("expired", "collapsed", "cancelled", "redeemed"):
        raise HTTPException(status_code=409, detail=f"Huddle has already ended (status={b.status})")
    if b.status == "confirmed":
        raise HTTPException(status_code=409, detail="This group is already confirmed and can't be cancelled")

    refunded = 0
    if b.status == "collecting":
        refunded, _ = flow.refund_participants(b, "Impulse huddle cancelled")
        flow.release_spots(db, b)

    b.status = "cancelled"
    flow.touch(b)
    db.commit()

    body = "The huddle was called off — you've been refunded." if refunded else "The huddle was called off. Nobody was charged."
    flow.push_all(db, b, "Huddle cancelled", body, "huddle_cancelled")
    logger.info("Huddle %s cancelled by creator (%d refund(s))", b.id, refunded)

    b = _load(db, huddle_id)
    return flow.view(b, me)
