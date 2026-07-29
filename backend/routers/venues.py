from datetime import date as dt_date
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import payments
from auth import get_current_user
from database import get_db
from huddle_logic import parse_slot_datetime
from models import Booking, Deal, Settlement, SettlementLine, Venue
from schemas import (
    DealPerformanceItem,
    DealResponse,
    PayoutLine,
    PayoutResponse,
    PayoutsResponse,
    PayoutSummary,
    StatsResponse,
    VenueCreate,
    VenueResponse,
    VenueUpdate,
)

router = APIRouter()


def _get_venue_or_404(venue_id: str, db: Session) -> Venue:
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    return venue


def _assert_owner(venue: Venue, user: dict) -> None:
    if venue.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized for this venue")


@router.post("", response_model=VenueResponse, status_code=201)
def create_venue(
    body: VenueCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    venue = Venue(**body.model_dump(), owner_id=user["sub"])
    db.add(venue)
    db.commit()
    db.refresh(venue)
    return venue


@router.get("/mine", response_model=VenueResponse)
def get_my_venue(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return the active venue owned by the current user, or 404."""
    venue = (
        db.query(Venue)
        .filter(Venue.owner_id == user["sub"], Venue.is_active == True)
        .first()
    )
    if not venue:
        raise HTTPException(status_code=404, detail="No venue found for this user")
    return venue


@router.get("/{venue_id}", response_model=VenueResponse)
def get_venue(venue_id: str, db: Session = Depends(get_db)):
    return _get_venue_or_404(venue_id, db)


@router.patch("/{venue_id}", response_model=VenueResponse)
def update_venue(
    venue_id: str,
    body: VenueUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(venue, key, value)
    db.commit()
    db.refresh(venue)
    return venue


@router.delete("/{venue_id}", status_code=204)
def deactivate_venue(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    venue.is_active = False
    db.commit()


@router.get("/{venue_id}/deals", response_model=List[DealResponse])
def list_venue_deals(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: all deals for a venue (events management screen)."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    return (
        db.query(Deal)
        .filter(Deal.venue_id == venue_id)
        .order_by(Deal.created_at.desc())
        .all()
    )


@router.get("/{venue_id}/payouts", response_model=PayoutsResponse)
def get_payouts(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: money actually transferred to the bank, newest first.

    Sliced to this venue: while every charge runs through the single Impulse
    merchant a transfer covers many venues, so the venue sees its own lines and
    its own share rather than the whole transfer.
    """
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)

    lines = (
        db.query(SettlementLine)
        .filter(SettlementLine.venue_id == venue_id)
        .order_by(SettlementLine.transaction_date.desc().nullslast())
        .all()
    )

    # Booking/deal lookups for the line detail, in two queries rather than N.
    booking_ids = {ln.booking_id for ln in lines if ln.booking_id}
    bookings = (
        {b.id: b for b in db.query(Booking).filter(Booking.id.in_(booking_ids)).all()}
        if booking_ids else {}
    )
    deal_titles = {
        d.id: d.title
        for d in db.query(Deal).filter(Deal.venue_id == venue_id).all()
    }

    by_settlement: dict = {}
    for ln in lines:
        by_settlement.setdefault(ln.settlement_id, []).append(ln)

    settlements_rows = (
        db.query(Settlement)
        .filter(Settlement.id.in_(by_settlement.keys()))
        .order_by(Settlement.transfer_date.desc().nullslast())
        .all()
        if by_settlement else []
    )

    payouts: List[PayoutResponse] = []
    paid_cents = 0
    in_transit_cents = 0
    for s in settlements_rows:
        s_lines = by_settlement.get(s.id, [])
        venue_share = sum(ln.venue_amount_cents for ln in s_lines)
        if s.status == "complete":
            paid_cents += venue_share
        else:
            in_transit_cents += venue_share

        payouts.append(PayoutResponse(
            id=s.id,
            pinch_transfer_id=s.pinch_transfer_id,
            status=s.status,
            reference=s.reference,
            currency=s.currency,
            amount_cents=venue_share,
            transfer_net_cents=s.amount_cents,
            transfer_date=s.transfer_date,
            account_name=s.account_name,
            bsb=s.bsb,
            account_number=s.account_number,
            lines=[
                PayoutLine(
                    booking_id=ln.booking_id,
                    confirmation_code=(
                        bookings[ln.booking_id].confirmation_code
                        if ln.booking_id in bookings else None
                    ),
                    deal_title=(
                        deal_titles.get(bookings[ln.booking_id].deal_id)
                        if ln.booking_id in bookings else None
                    ),
                    kind=ln.kind,
                    line_type=ln.line_type,
                    amount_cents=ln.venue_amount_cents,
                    transaction_date=ln.transaction_date,
                )
                for ln in s_lines
            ],
        ))

    # Earned but not yet in any transfer: redeemed bookings whose balance has
    # been charged and settled to nothing yet. Deposits are excluded because
    # they are Impulse's in full and never settle to the venue.
    settled_booking_ids = {ln.booking_id for ln in lines if ln.booking_id}
    venue_deal_ids = list(deal_titles.keys())
    awaiting_cents = 0
    if venue_deal_ids:
        unsettled = (
            db.query(Booking)
            .filter(
                Booking.deal_id.in_(venue_deal_ids),
                Booking.payment_status == "fully_paid",
                Booking.balance_payment_id.isnot(None),
            )
            .all()
        )
        for b in unsettled:
            if b.id in settled_booking_ids:
                continue
            balance = b.balance_amount_cents or 0
            awaiting_cents += balance - round(balance * payments.BALANCE_APPLICATION_FEE_RATE)

    return PayoutsResponse(
        summary=PayoutSummary(
            paid_cents=paid_cents,
            in_transit_cents=in_transit_cents,
            awaiting_cents=awaiting_cents,
            payout_count=len(payouts),
            last_payout_date=payouts[0].transfer_date if payouts else None,
        ),
        payouts=payouts,
    )


@router.get("/{venue_id}/stats", response_model=StatsResponse)
def get_stats(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: dashboard stats for a venue."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)

    active_deals_q = db.query(Deal).filter(
        Deal.venue_id == venue_id, Deal.is_active == True
    )
    active_deals_count = active_deals_q.count()

    deal_ids = [
        row.id
        for row in db.query(Deal.id).filter(Deal.venue_id == venue_id).all()
    ]

    today_bookings = (
        db.query(Booking)
        .filter(
            Booking.deal_id.in_(deal_ids),
            func.date(Booking.created_at) == dt_date.today(),
        )
        .all()
        if deal_ids
        else []
    )

    active_deal_rows = active_deals_q.all()
    total_spots = sum(d.total_spots for d in active_deal_rows)
    spots_remaining = sum(d.spots_remaining for d in active_deal_rows)

    return StatsResponse(
        active_deals=active_deals_count,
        bookings_today=len(today_bookings),
        revenue_today=round(sum(b.total_paid for b in today_bookings), 2),
        spots_filled=total_spots - spots_remaining,
        total_spots=total_spots,
    )


def _deal_ended_at(deal: Deal) -> Optional[datetime]:
    """When the deal finished running: its last slot, else expires_at. Naive
    parses are read as UTC — same convention as huddles._cutoff()."""
    slot_times = [t for s in (deal.slots or []) if (t := parse_slot_datetime(deal.date, s))]
    ended = max(slot_times) if slot_times else deal.expires_at
    if ended is None:
        return None
    return ended if ended.tzinfo else ended.replace(tzinfo=timezone.utc)


@router.get("/{venue_id}/deal-performance", response_model=List[DealPerformanceItem])
def get_deal_performance(
    venue_id: str,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: how the venue's finished deals actually sold — fill rate and how
    long each took to draw its last booking. Newest first."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)

    now = datetime.now(timezone.utc)
    completed: List[Deal] = []
    for deal in (
        db.query(Deal)
        .filter(Deal.venue_id == venue_id)
        .order_by(Deal.created_at.desc())
        .all()
    ):
        ended = _deal_ended_at(deal)
        if ended is not None and ended <= now:
            completed.append(deal)
        if len(completed) == limit:
            break

    if not completed:
        return []

    # Cancelled bookings release their spots, so they don't count as demand.
    booking_rows = (
        db.query(
            Booking.deal_id,
            func.count(Booking.id),
            func.max(Booking.created_at),
        )
        .filter(
            Booking.deal_id.in_([d.id for d in completed]),
            Booking.status != "cancelled",
        )
        .group_by(Booking.deal_id)
        .all()
    )
    by_deal = {deal_id: (count, last) for deal_id, count, last in booking_rows}

    items = []
    for deal in completed:
        bookings, last_booking_at = by_deal.get(deal.id, (0, None))
        filled = deal.total_spots - deal.spots_remaining

        minutes = None
        if last_booking_at is not None:
            live_at = deal.created_at
            if live_at.tzinfo is None:
                live_at = live_at.replace(tzinfo=timezone.utc)
            if last_booking_at.tzinfo is None:
                last_booking_at = last_booking_at.replace(tzinfo=timezone.utc)
            minutes = max(0, round((last_booking_at - live_at).total_seconds() / 60))

        items.append(
            DealPerformanceItem(
                deal_id=deal.id,
                title=deal.title,
                category=deal.category,
                discount_pct=float(deal.discount_pct),
                date=deal.date,
                slots=deal.slots or [],
                total_spots=deal.total_spots,
                spots_filled=filled,
                fill_rate=round(filled / deal.total_spots * 100, 1) if deal.total_spots else 0.0,
                bookings=bookings,
                minutes_to_last_booking=minutes,
            )
        )
    return items
