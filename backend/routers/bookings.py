import logging
import secrets
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import booking_flow as flow
from auth import get_current_user
from booking_logic import SplitError
from database import get_db
from models import Booking, BookingParticipant, Deal, User, Venue
from schemas import (
    BookingCreate,
    BookingPay,
    BookingResponse,
    BookingView,
    BookingWithDetailsResponse,
    CancelResponse,
    CoverRequest,
    RedeemMemberResult,
    RedeemResponse,
    SeatInvite,
    SeatLanding,
    SplitEdit,
    VerifyMember,
    VerifyResponse,
)

router = APIRouter()
logger = logging.getLogger("impulse.bookings")

MAX_GROUP = 10


def profile_name(db: Session, user: dict, preferred: Optional[str] = None) -> str:
    """The name friends see: what the client sends, then the profile's full
    name, then the email's local part — never a role label."""
    profile = db.query(User).filter(User.id == user["sub"]).first()
    email_username = profile.email.split("@")[0] if profile and profile.email else None
    return (
        (preferred or "").strip()
        or (profile.full_name.strip() if profile and profile.full_name else None)
        or email_username
        or "You"
    )[:40]


def ensure_user_row(db: Session, user: dict) -> None:
    """A participant's user_id is a FK into public.users. That row is normally
    created by a Supabase trigger / first profile sync, but someone can open a
    link before either runs — so create a minimal row on demand."""
    if not db.query(User).filter(User.id == user["sub"]).first():
        db.add(User(id=user["sub"], email=user.get("email")))
        db.flush()


def _details(db: Session, booking_id: str, user: dict) -> BookingWithDetailsResponse:
    b = flow.load(db, booking_id)
    return BookingWithDetailsResponse.from_booking(b, user["sub"])


def _split_error(e: SplitError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(e))


# NOTE: literal paths (/me, /seat, /verify, /redeem) must be declared before
# /{booking_id} so FastAPI doesn't treat them as booking IDs.

@router.get("/me", response_model=List[BookingWithDetailsResponse])
def get_my_bookings(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """User: every booking the caller holds a seat in (solo, split or Huddle),
    once its deal is known."""
    bookings = (
        db.query(Booking)
        .join(BookingParticipant, BookingParticipant.booking_id == Booking.id)
        .options(joinedload(Booking.deal).joinedload(Deal.venue), joinedload(Booking.participants))
        .filter(BookingParticipant.user_id == user["sub"], Booking.deal_id.isnot(None))
        .order_by(Booking.created_at.desc())
        .all()
    )
    return [BookingWithDetailsResponse.from_booking(b, user["sub"]) for b in bookings]


@router.get("", response_model=List[BookingResponse])
def list_bookings_for_deal(
    deal_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: all bookings for a specific deal (dashboard recent bookings)."""
    if not deal_id:
        raise HTTPException(status_code=400, detail="deal_id query param is required")

    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    venue = db.query(Venue).filter(Venue.id == deal.venue_id).first()
    if not venue or venue.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    bookings = (
        db.query(Booking)
        .options(joinedload(Booking.participants))
        .filter(Booking.deal_id == deal_id)
        .order_by(Booking.created_at.desc())
        .all()
    )
    # A group booking needs following up if any seat's charge declined.
    return [
        BookingResponse.model_validate(b).model_copy(update={
            **BookingResponse.seat_fields(b, None),
            "payment_followup": any(p.payment_followup for p in b.participants),
        })
        for b in bookings
    ]


@router.post("", response_model=BookingWithDetailsResponse, status_code=201)
def create_booking(
    body: BookingCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    User: start a booking. Without `split` the initiator pays for the whole
    group as one payer. With `split` (Huddle Pay) there's a seat per person,
    each with its own share, and friends can be invited straight away. The
    price is locked now and never re-read from the deal. Nothing is charged
    and no spots are held until the initiator pays their share
    (POST /bookings/{id}/pay), which locks the slot for everyone.
    """
    deal = db.query(Deal).filter(Deal.id == body.deal_id, Deal.is_active == True).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found or inactive")
    if body.slot_time not in deal.slots:
        raise HTTPException(status_code=400, detail="Invalid time slot for this deal")
    if body.num_people < 1:
        raise HTTPException(status_code=400, detail="num_people must be at least 1")
    if body.num_people > min(deal.max_group_size, MAX_GROUP):
        raise HTTPException(status_code=400, detail=f"Max group size for this deal is {deal.max_group_size}")
    if deal.spots_remaining < body.num_people:
        raise HTTPException(status_code=409, detail=f"Only {deal.spots_remaining} spot(s) remaining")

    if not body.split and (body.amounts or body.covers):
        raise HTTPException(status_code=400, detail="Amounts and covers only apply to a split booking")

    # A caller retrying (backed out of the card form) replaces their unpaid
    # attempt rather than stacking a second one — unless friends have
    # already been invited to it, in which case it's left alone.
    stale = (
        db.query(Booking)
        .join(BookingParticipant, BookingParticipant.id == Booking.initiator_member_id)
        .filter(
            Booking.deal_id == body.deal_id,
            Booking.user_id == user["sub"],
            Booking.has_voting == False,
            Booking.status == "collecting",
            BookingParticipant.deposit_status == "unpaid",
        )
        .all()
    )
    stale = [old for old in stale if not any(
        p.user_id and p.id != old.initiator_member_id for p in old.participants
    )]
    for old in stale:
        old.status = "cancelled"
        flow.release_spots(db, old)
        flow.touch(old)

    ensure_user_row(db, user)
    b = Booking(
        deal_id=deal.id,
        user_id=user["sub"],
        slot_time=body.slot_time,
        num_people=body.num_people,
        total_paid=0,
        status="collecting",
        has_voting=False,
        split_mode=body.split_mode,
        share_deadline=flow.share_deadline_for(deal, body.slot_time),
        split_confirmed_at=flow.now(),
    )
    b.deal = deal
    flow.lock_price(b, deal)
    db.add(b)
    db.flush()

    labels = body.seat_labels or []
    seats = []
    for i in range(body.num_people if body.split else 1):
        label = (labels[i] if i < len(labels) else None) or None
        seat = BookingParticipant(
            booking_id=b.id,
            user_id=user["sub"] if i == 0 else None,
            display_name=profile_name(db, user) if i == 0 else None,
            seat_label=label.strip()[:40] if label else None,
            seat_token=None if i == 0 else secrets.token_urlsafe(16),
            claimed_at=flow.now() if i == 0 else None,
            joined_at=flow.now(),
        )
        db.add(seat)
        seats.append(seat)
    db.flush()
    b.initiator_member_id = seats[0].id
    b.participants = seats

    try:
        by_index = {s.covered: s.coverer for s in body.covers}
        if any(not (0 <= i < len(seats)) for pair in by_index.items() for i in pair):
            raise SplitError("That seat isn't part of this booking")
        covers = {seats[c].id: seats[r].id for c, r in by_index.items()}
        if body.split_mode == "custom":
            if body.amounts is None or len(body.amounts) != len(seats):
                raise SplitError("Give an amount for every seat")
            flow.edit_split(b, "custom", {s.id: a for s, a in zip(seats, body.amounts)}, covers)
        else:
            flow.even_shares(b)
            if covers:
                flow.edit_split(b, "even", None, covers)
    except SplitError as e:
        db.rollback()
        raise _split_error(e)

    db.commit()
    return _details(db, b.id, user)


@router.post("/{booking_id}/pay", response_model=BookingWithDetailsResponse)
def pay_share(
    booking_id: str,
    body: BookingPay,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Any participant: pay my deposit share via Pinch — exactly the amount I was
    shown (body.expected_deposit_cents), or a 409 if it has since changed.
    The initiator's payment locks the slot. When the last share lands the
    code is issued to everyone at once.
    """
    b = flow.load(db, booking_id, lock=True)
    me = flow.member_of(b, user)
    flow.pay_share(db, b, me, user, body)
    return _details(db, booking_id, user)


@router.post("/seat/{seat_token}/claim", response_model=SeatLanding)
def claim_seat(
    seat_token: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """A friend opens their seat link: the seat becomes theirs, and they see
    who booked, where, when, and their exact share."""
    seat = (
        db.query(BookingParticipant)
        .filter(BookingParticipant.seat_token == seat_token)
        .with_for_update()
        .first()
    )
    if not seat:
        raise HTTPException(status_code=404, detail="This link isn't valid any more")
    b = flow.load(db, seat.booking_id)

    mine = next((p for p in b.participants if p.user_id == user["sub"]), None)
    if mine and mine.id != seat.id:
        seat = mine   # already in this booking — show their own seat
    elif seat.user_id and seat.user_id != user["sub"]:
        raise HTTPException(status_code=409, detail="This spot is saved for someone else")
    elif seat.user_id and seat.claimed_at is None:
        seat.claimed_at = flow.now()   # invited in-app, now opened
        flow.touch(b)
        db.commit()
        b = flow.load(db, b.id)
        seat = next(p for p in b.participants if p.id == seat.id)
    elif not seat.user_id:
        if b.status != "collecting":
            raise HTTPException(status_code=409, detail="This booking has closed")
        ensure_user_row(db, user)
        seat.user_id = user["sub"]
        seat.display_name = profile_name(db, user)
        seat.claimed_at = flow.now()
        flow.touch(b)
        db.commit()
        b = flow.load(db, b.id)
        seat = next(p for p in b.participants if p.id == seat.id)

    return SeatLanding(
        booking_id=b.id,
        member_id=seat.id,
        initiator_name=flow.display_name(flow.initiator(b)),
        venue_name=b.deal.venue.name,
        deal_title=b.deal.title,
        slot=flow.slot_label(b),
        share=flow.my_share(b, seat),
        booking_status=b.status,
        locked_in=flow.locked_in(b),
        share_deadline=b.share_deadline,
    )


@router.get("/{booking_id}/split", response_model=BookingView)
def get_split(
    booking_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Participant: the live meter — who's in, my share, the initiator's
    remaining exposure, and the code once everyone's in."""
    b = flow.load(db, booking_id)
    return flow.view(b, flow.member_of(b, user))


@router.patch("/{booking_id}/split", response_model=BookingView)
def edit_split(
    booking_id: str,
    body: SplitEdit,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Initiator: choose or change the split for seats that haven't paid.
    Shares must sum exactly to the locked price; paid shares never change —
    a request that would need either is rejected with the reason. On a Huddle
    this is also how the creator confirms the split before shares are collected."""
    b = flow.load(db, booking_id, lock=True)
    me = flow.member_of(b, user)
    if me.id != b.initiator_member_id:
        raise HTTPException(status_code=403, detail="Only the person who booked can change the split")
    if b.status != "collecting":
        raise HTTPException(status_code=409, detail=f"The split can't change now (status={b.status})")
    try:
        flow.edit_split(b, body.split_mode, body.amounts, body.covers)
    except SplitError as e:
        db.rollback()
        raise _split_error(e)
    first_confirm = b.split_confirmed_at is None
    b.split_confirmed_at = b.split_confirmed_at or flow.now()
    flow.touch(b)
    db.commit()
    b = flow.load(db, booking_id)
    if first_confirm and b.has_voting:
        flow.push_shares(db, b)
    flow.maybe_confirm(db, b)
    return flow.view(flow.load(db, booking_id), me)


@router.post("/{booking_id}/cover", response_model=BookingView)
def cover_share(
    booking_id: str,
    body: CoverRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Participant: cover someone's share — it's added to mine, they owe nothing."""
    b = flow.load(db, booking_id, lock=True)
    me = flow.member_of(b, user)
    if b.status != "collecting":
        raise HTTPException(status_code=409, detail=f"Shares can't change now (status={b.status})")
    try:
        flow.cover(b, me, body.covered_member_id)
    except SplitError as e:
        db.rollback()
        raise _split_error(e)
    flow.touch(b)
    db.commit()
    b = flow.load(db, booking_id)
    flow.maybe_confirm(db, b)
    return flow.view(flow.load(db, booking_id), me)


@router.delete("/{booking_id}/seats/{member_id}", response_model=BookingView)
def remove_seat(
    booking_id: str,
    member_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Initiator: take a seat out. The group shrinks and the unpaid shares
    re-split; anyone who has paid keeps exactly what they paid."""
    b = flow.load(db, booking_id, lock=True)
    me = flow.member_of(b, user)
    if me.id != b.initiator_member_id:
        raise HTTPException(status_code=403, detail="Only the person who booked can remove someone")
    if b.status != "collecting":
        raise HTTPException(status_code=409, detail=f"The group can't change now (status={b.status})")
    seat = next((p for p in b.participants if p.id == member_id), None)
    if not seat:
        raise HTTPException(status_code=404, detail="That seat isn't part of this booking")
    try:
        flow.remove_seat(db, b, seat)
    except SplitError as e:
        db.rollback()
        raise _split_error(e)
    flow.touch(b)
    db.commit()
    b = flow.load(db, booking_id)
    flow.maybe_confirm(db, b)
    return flow.view(flow.load(db, booking_id), me)


@router.post("/{booking_id}/seats/{member_id}/invite", response_model=BookingView)
def invite_to_seat(
    booking_id: str,
    member_id: str,
    body: SeatInvite,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Initiator: save a seat for a friend on Impulse. The seat is theirs
    straight away (it shows up in their Plans) and they get a push with
    their share. Works before the initiator has paid — they just can't pay
    until the slot is locked in. Re-inviting replaces an unpaid invitee."""
    b = flow.load(db, booking_id, lock=True)
    me = flow.member_of(b, user)
    if me.id != b.initiator_member_id:
        raise HTTPException(status_code=403, detail="Only the person who booked can invite people")
    if b.has_voting or b.status != "collecting":
        raise HTTPException(status_code=409, detail="This booking isn't taking invites")
    seat = next((p for p in b.participants if p.id == member_id), None)
    if not seat or seat.id == b.initiator_member_id:
        raise HTTPException(status_code=404, detail="That seat isn't part of this booking")
    if seat.deposit_status in flow.DEPOSIT_FIXED:
        raise HTTPException(status_code=409, detail="That seat is already paid for")
    if seat.claimed_at is not None and seat.user_id:
        raise HTTPException(status_code=409, detail="Someone has already taken that spot")
    if any(p.user_id == body.user_id for p in b.participants):
        raise HTTPException(status_code=409, detail="They're already in this booking")
    friend = db.query(User).filter(User.id == body.user_id).first()
    if not friend:
        raise HTTPException(status_code=404, detail="We couldn't find that person")

    seat.user_id = friend.id
    seat.display_name = ((friend.full_name or "").strip() or "Friend")[:40]
    seat.seat_label = None
    seat.claimed_at = None
    flow.touch(b)
    db.commit()
    b = flow.load(db, booking_id)
    flow.push_invite(db, b, next(p for p in b.participants if p.id == member_id))
    return flow.view(b, flow.member_of(b, user))


@router.post("/{booking_id}/decline", status_code=204)
def decline_seat(
    booking_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Invitee: can't make it. The seat opens back up for the person who
    booked to invite someone else (or take it out of the split). Only before
    paying — a paid share stays."""
    b = flow.load(db, booking_id, lock=True)
    me = flow.member_of(b, user)
    if me.id == b.initiator_member_id:
        raise HTTPException(status_code=409, detail="Cancel the booking instead")
    if b.has_voting:
        raise HTTPException(status_code=409, detail="Leave a huddle from the huddle screen")
    if me.deposit_status in flow.DEPOSIT_FIXED:
        raise HTTPException(status_code=409, detail="You've already paid your share")
    name = flow.display_name(me)
    me.user_id = None
    me.display_name = None
    me.claimed_at = None
    flow.touch(b)
    db.commit()
    flow.push_declined(db, flow.load(db, booking_id), name)


def _load_by_code(db: Session, code: str, user: dict) -> Booking:
    b = (
        db.query(Booking)
        .options(joinedload(Booking.participants), joinedload(Booking.deal).joinedload(Deal.venue))
        .filter(Booking.confirmation_code == code)
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Code not found")
    venue = b.deal.venue if b.deal else None
    if not venue or venue.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized for this venue")
    return b


@router.get("/verify/{code}", response_model=VerifyResponse)
def verify_code(
    code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Venue: preview any code before confirming — group size, names and the
    balance about to be collected. No money moves here."""
    b = _load_by_code(db, code, user)
    members = [
        VerifyMember(name=flow.display_name(p), balance_cents=p.balance_cents or 0, balance_status=p.balance_status)
        for p in flow.share_order(b)
        if p.deposit_status not in ("settled",) or (p.balance_cents or 0) > 0
    ]
    return VerifyResponse(
        booking_id=b.id,
        confirmation_code=b.confirmation_code,
        group_size=b.num_people,
        venue_name=b.deal.venue.name,
        deal_title=b.deal.title,
        slot=flow.slot_label(b),
        total_balance_cents=sum(m.balance_cents for m in members),
        members=members,
        status=b.status,
        already_redeemed=b.status == "redeemed",
        redeemed_at=b.redeemed_at,
    )


@router.post("/redeem/{code}", response_model=RedeemResponse)
def redeem_code(
    code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Venue: confirm the booking and charge each seat's balance against its card
    (the initiator's, for seats they guaranteed). A declined balance never
    blocks redemption — it's flagged and the venue collects directly.
    - 409: already redeemed, cancelled, or not confirmed yet
    - 404: code not found
    - 403: code belongs to a different venue
    """
    b = _load_by_code(db, code, user)
    if b.status == "redeemed":
        raise HTTPException(
            status_code=409,
            detail="This code was already redeemed",
            headers={"X-Redeemed-At": str(b.redeemed_at)},
        )
    if b.status != "confirmed":
        raise HTTPException(status_code=409, detail=f"This code isn't active (status={b.status})")

    result = flow.redeem(db, b)
    return RedeemResponse(
        booking_id=b.id,
        confirmation_code=b.confirmation_code,
        status=b.status,
        slot_time=b.slot_time,
        num_people=b.num_people,
        redeemed_at=b.redeemed_at,
        members=[RedeemMemberResult(**m) for m in result["members"]],
        total_charged_cents=result["total_charged_cents"],
        declines=result["declines"],
    )


@router.get("/{booking_id}", response_model=BookingResponse)
def get_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Accessible by: a participant OR the venue admin."""
    b = flow.load(db, booking_id)
    if any(p.user_id == user["sub"] for p in b.participants) or (
        b.deal and b.deal.venue and b.deal.venue.owner_id == user["sub"]
    ):
        return BookingResponse.model_validate(b).model_copy(update=BookingResponse.seat_fields(b, user["sub"]))
    raise HTTPException(status_code=403, detail="Not authorized")


@router.post("/{booking_id}/cancel", response_model=CancelResponse)
def cancel_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Initiator: cancel a booking. Deposits are NON-REFUNDABLE — no Pinch refund
    call is ever made. A split booking can only be cancelled while the
    initiator is the only one who has paid: once friends have paid, it stays.
    Huddles are cancelled via /huddles/{id}/cancel.
    """
    b = flow.load(db, booking_id, lock=True)
    me = flow.member_of(b, user)
    if b.has_voting:
        raise HTTPException(status_code=409, detail="Cancel a huddle from the huddle screen")
    if me.id != b.initiator_member_id:
        raise HTTPException(status_code=403, detail="Only the person who booked can cancel it")
    if b.status == "cancelled":
        raise HTTPException(status_code=409, detail="Booking is already cancelled")
    if b.status == "redeemed":
        raise HTTPException(status_code=409, detail="Booking has been used and cannot be cancelled")
    if any(p.id != me.id and p.deposit_status in flow.DEPOSIT_FIXED for p in b.participants):
        raise HTTPException(
            status_code=409,
            detail="Friends have already paid their shares, so this booking can't be cancelled",
        )

    deposit_forfeited = me.deposit_status == "paid"
    b.status = "cancelled"
    flow.release_spots(db, b)   # the venue can resell them (the deposit is still kept)
    flow.touch(b)
    db.commit()

    # Venue notification is a later feature — log for now.
    logger.info(
        "Booking %s cancelled by user %s — venue %s, slot %s, deposit_forfeited=%s (deposit %s cents kept by Impulse)",
        b.id, user["sub"], b.deal.venue.name, b.slot_time, deposit_forfeited, me.deposit_cents,
    )
    return CancelResponse(
        cancelled=True,
        depositForfeited=deposit_forfeited,
        depositAmountCents=me.deposit_cents or 0,
    )
