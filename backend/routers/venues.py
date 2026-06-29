from datetime import date as dt_date
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Booking, Deal, Venue
from schemas import DealResponse, StatsResponse, VenueCreate, VenueResponse, VenueUpdate

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
