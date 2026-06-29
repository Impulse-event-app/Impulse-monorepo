import secrets
import string
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Booking, Deal, Venue
from schemas import BookingCreate, BookingResponse, RedeemResponse

router = APIRouter()


def _generate_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "IMP-" + "".join(secrets.choice(alphabet) for _ in range(6))


# NOTE: /me must be declared before /{booking_id} to prevent FastAPI
# treating the literal string "me" as a booking ID.

@router.get("/me", response_model=List[BookingResponse])
def get_my_bookings(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """User: all bookings belonging to the calling user."""
    return (
        db.query(Booking)
        .filter(Booking.user_id == user["sub"])
        .order_by(Booking.created_at.desc())
        .all()
    )


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

    return (
        db.query(Booking)
        .filter(Booking.deal_id == deal_id)
        .order_by(Booking.created_at.desc())
        .all()
    )


@router.post("", response_model=BookingResponse, status_code=201)
def create_booking(
    body: BookingCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    User: book a deal.
    Uses SELECT FOR UPDATE to atomically decrement spots_remaining and
    prevent concurrent over-booking.
    """
    deal = (
        db.query(Deal)
        .filter(Deal.id == body.deal_id, Deal.is_active == True)
        .with_for_update()
        .first()
    )
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found or inactive")

    if body.slot_time not in deal.slots:
        raise HTTPException(status_code=400, detail="Invalid time slot for this deal")

    if body.num_people < 1:
        raise HTTPException(status_code=400, detail="num_people must be at least 1")

    if body.num_people > deal.max_group_size:
        raise HTTPException(
            status_code=400,
            detail=f"Max group size for this deal is {deal.max_group_size}",
        )

    if deal.spots_remaining < body.num_people:
        raise HTTPException(
            status_code=409,
            detail=f"Only {deal.spots_remaining} spot(s) remaining",
        )

    deal.spots_remaining -= body.num_people

    # Generate a unique confirmation code (collision is astronomically unlikely but handled)
    code = _generate_code()
    for _ in range(4):
        if not db.query(Booking).filter(Booking.confirmation_code == code).first():
            break
        code = _generate_code()

    booking = Booking(
        deal_id=body.deal_id,
        user_id=user["sub"],
        slot_time=body.slot_time,
        num_people=body.num_people,
        total_paid=round(deal.deal_price * body.num_people, 2),
        confirmation_code=code,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@router.get("/{booking_id}", response_model=BookingResponse)
def get_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Accessible by: the booking owner OR the venue admin."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.user_id == user["sub"]:
        return booking

    # Check if caller is the venue admin for this booking's deal
    deal = db.query(Deal).filter(Deal.id == booking.deal_id).first()
    venue = db.query(Venue).filter(Venue.id == deal.venue_id).first() if deal else None
    if venue and venue.owner_id == user["sub"]:
        return booking

    raise HTTPException(status_code=403, detail="Not authorized")


@router.post("/redeem/{confirmation_code}", response_model=RedeemResponse)
def redeem_booking(
    confirmation_code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Venue admin: validate and redeem a ticket by its confirmation code.
    The venue scans the QR code which encodes the confirmation_code string.
    - 200: valid, now marked attended
    - 409: already redeemed or cancelled
    - 404: code not found
    - 403: code belongs to a different venue
    """
    booking = db.query(Booking).filter(Booking.confirmation_code == confirmation_code).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Ticket not found")

    deal = db.query(Deal).filter(Deal.id == booking.deal_id).first()
    venue = db.query(Venue).filter(Venue.id == deal.venue_id).first() if deal else None
    if not venue or venue.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized for this venue")

    if booking.status == "attended":
        raise HTTPException(
            status_code=409,
            detail="Ticket already redeemed",
            headers={"X-Redeemed-At": str(booking.redeemed_at)},
        )
    if booking.status == "cancelled":
        raise HTTPException(status_code=409, detail="Ticket was cancelled")

    booking.status = "attended"
    booking.redeemed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(booking)
    return booking

