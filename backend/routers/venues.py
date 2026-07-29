from datetime import date as dt_date
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from huddle_logic import parse_slot_datetime
from models import Booking, Deal, Venue
from schemas import (
    DealPerformanceItem,
    DealResponse,
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
