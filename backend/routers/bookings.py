import logging
import os
import secrets
import string
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import payments
from auth import get_current_user
from database import get_db
from models import Booking, Deal, Venue
from pinch_client import PinchError
from schemas import (
    BookingCreate,
    BookingPay,
    BookingResponse,
    BookingWithDetailsResponse,
    CancelResponse,
    RedeemResponse,
)

router = APIRouter()
logger = logging.getLogger("impulse.bookings")

PINCH_MERCHANT_ID: str = os.environ["PINCH_TEST_MERCHANT_ID"]

DEPOSIT_RATE = 0.20
DEPOSIT_FLOOR_CENTS = 100  # $1.00 floor handles sub-$5 totals


def _generate_code() -> str:
    """A 6-digit numeric code the customer reads out / the venue types in."""
    return "".join(secrets.choice(string.digits) for _ in range(6))


def _deposit_split(discounted_price_cents: int) -> tuple:
    """max(round(price * 0.20), 100) deposit; remainder is the balance.

    Deposit is clamped to the full price so sub-$1 totals can't produce a
    negative balance.
    """
    deposit = max(round(discounted_price_cents * DEPOSIT_RATE), DEPOSIT_FLOOR_CENTS)
    deposit = min(deposit, discounted_price_cents)
    return deposit, discounted_price_cents - deposit


# NOTE: /me must be declared before /{booking_id} to prevent FastAPI
# treating the literal string "me" as a booking ID.

@router.get("/me", response_model=List[BookingWithDetailsResponse])
def get_my_bookings(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """User: all bookings belonging to the calling user."""
    bookings = (
        db.query(Booking)
        .options(joinedload(Booking.deal).joinedload(Deal.venue))
        .filter(Booking.user_id == user["sub"])
        .order_by(Booking.created_at.desc())
        .all()
    )
    return [BookingWithDetailsResponse.from_booking(b) for b in bookings]


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


@router.post("", response_model=BookingWithDetailsResponse, status_code=201)
def create_booking(
    body: BookingCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    User: reserve a slot. The booking starts unpaid, with NO confirmation code —
    the code is only generated after the Pinch deposit succeeds (POST /bookings/{id}/pay).
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

    # If the caller already holds an unpaid reservation for this deal (e.g. they
    # backed out of the card form and retried), reuse it instead of stacking a
    # second hold — otherwise abandoned attempts drain spots_remaining.
    existing = (
        db.query(Booking)
        .filter(
            Booking.deal_id == body.deal_id,
            Booking.user_id == user["sub"],
            Booking.payment_status == "unpaid",
            Booking.status == "pending",
        )
        .first()
    )
    if existing:
        deal.spots_remaining += existing.num_people  # release the old hold before re-checking

    if deal.spots_remaining < body.num_people:
        raise HTTPException(
            status_code=409,
            detail=f"Only {deal.spots_remaining} spot(s) remaining",
        )

    deal.spots_remaining -= body.num_people

    total = round(deal.deal_price * body.num_people, 2)
    discounted_price_cents = int(round(total * 100))
    deposit_cents, balance_cents = _deposit_split(discounted_price_cents)

    if existing:
        existing.slot_time = body.slot_time
        existing.num_people = body.num_people
        existing.total_paid = total
        existing.deposit_amount_cents = deposit_cents
        existing.balance_amount_cents = balance_cents
        booking = existing
    else:
        booking = Booking(
            deal_id=body.deal_id,
            user_id=user["sub"],
            slot_time=body.slot_time,
            num_people=body.num_people,
            total_paid=total,
            confirmation_code=None,          # generated after deposit succeeds
            status="pending",                # confirmed once deposit is paid
            deposit_amount_cents=deposit_cents,
            balance_amount_cents=balance_cents,
            payment_status="unpaid",
        )
        db.add(booking)
    db.commit()
    db.refresh(booking)
    # Reload with relationships for the response
    booking = (
        db.query(Booking)
        .options(joinedload(Booking.deal).joinedload(Deal.venue))
        .filter(Booking.id == booking.id)
        .first()
    )
    return BookingWithDetailsResponse.from_booking(booking)


@router.post("/{booking_id}/pay", response_model=BookingWithDetailsResponse)
def pay_deposit(
    booking_id: str,
    body: BookingPay,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    User: charge the 20% deposit via Pinch using a CaptureJs card token.
    On success the card is vaulted, the 6-digit code is generated and returned.
    On failure nothing is updated and no code exists.
    """
    booking = (
        db.query(Booking)
        .options(joinedload(Booking.deal).joinedload(Deal.venue))
        .filter(Booking.id == booking_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if booking.payment_status == "deposit_paid":
        raise HTTPException(status_code=409, detail="Deposit already paid")
    if booking.payment_status != "unpaid":
        raise HTTPException(
            status_code=409, detail=f"Booking is not payable (payment_status={booking.payment_status})"
        )

    venue_name = booking.deal.venue.name
    slot = f"{booking.deal.date} {booking.slot_time}"

    try:
        # 1+2. Vault the card (payer + reusable source)
        booking.pinch_payer_id, booking.pinch_source_id = payments.vault_card(
            first_name=body.first_name,
            last_name=body.last_name,
            email=body.email,
            token=body.token,
            merchant_id=PINCH_MERCHANT_ID,
        )
        # 3. Charge the deposit via the shared orchestration.
        payment = payments.charge_deposit(
            payer_id=booking.pinch_payer_id,
            source_id=booking.pinch_source_id,
            amount_cents=booking.deposit_amount_cents,
            description=f"Impulse deposit — {venue_name} {slot}",
            metadata={
                "impulseBookingId": booking.id,
                "type": "deposit",
                "depositRate": DEPOSIT_RATE,
                "depositAmountCents": booking.deposit_amount_cents,
                "balanceAmountCents": booking.balance_amount_cents,
                "fullDiscountedPriceCents": booking.deposit_amount_cents + booking.balance_amount_cents,
            },
            nonce=f"deposit-{booking.id}",
            merchant_id=PINCH_MERCHANT_ID,
        )
    except PinchError as e:
        db.rollback()
        logger.error("Pinch deposit failed for booking %s: %s %s", booking_id, e.status_code, e.body)
        raise HTTPException(status_code=402, detail=f"Deposit payment failed: {e.body}")

    # Deposit approved — record it and only now generate the confirmation code
    booking.deposit_payment_id = payment["id"]
    booking.payment_status = "deposit_paid"
    booking.status = "confirmed"

    code = _generate_code()
    for _ in range(4):
        if not db.query(Booking).filter(Booking.confirmation_code == code).first():
            break
        code = _generate_code()
    booking.confirmation_code = code

    db.commit()
    db.refresh(booking)
    return BookingWithDetailsResponse.from_booking(booking)


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


@router.post("/{booking_id}/cancel", response_model=CancelResponse)
def cancel_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    User: cancel a booking. The deposit is NON-REFUNDABLE under all
    circumstances — no Pinch refund call is ever made.
    """
    booking = (
        db.query(Booking)
        .options(joinedload(Booking.deal).joinedload(Deal.venue))
        .filter(Booking.id == booking_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if booking.status == "cancelled" or booking.payment_status == "cancelled":
        raise HTTPException(status_code=409, detail="Booking is already cancelled")
    if booking.payment_status == "fully_paid":
        raise HTTPException(status_code=409, detail="Booking is fully paid and cannot be cancelled")

    deposit_forfeited = booking.payment_status == "deposit_paid"

    booking.status = "cancelled"
    booking.payment_status = "cancelled"
    # Free the held spots so the venue can resell them (deposit is still kept).
    booking.deal.spots_remaining = min(
        booking.deal.spots_remaining + booking.num_people,
        booking.deal.total_spots,
    )
    db.commit()

    # Venue notification is a later feature — log for now.
    logger.info(
        "Booking %s cancelled by user %s — venue %s, slot %s, deposit_forfeited=%s (deposit %s cents kept by Impulse)",
        booking.id,
        user["sub"],
        booking.deal.venue.name,
        booking.slot_time,
        deposit_forfeited,
        booking.deposit_amount_cents,
    )

    return CancelResponse(
        cancelled=True,
        depositForfeited=deposit_forfeited,
        depositAmountCents=booking.deposit_amount_cents or 0,
    )


@router.post("/redeem/{confirmation_code}", response_model=RedeemResponse)
def redeem_booking(
    confirmation_code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Venue admin: validate and redeem a ticket by its confirmation code,
    then charge the 80% balance against the vaulted card.
    - 200: valid, now marked attended (payment_warning set if the balance charge declined)
    - 409: already redeemed or cancelled
    - 404: code not found
    - 403: code belongs to a different venue
    A declined balance charge does NOT block redemption — the booking is
    flagged for follow-up and the venue collects payment directly.
    """
    booking = (
        db.query(Booking)
        .options(joinedload(Booking.deal).joinedload(Deal.venue))
        .filter(Booking.confirmation_code == confirmation_code)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Ticket not found")

    venue = booking.deal.venue if booking.deal else None
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
    if booking.payment_status != "deposit_paid":
        raise HTTPException(
            status_code=409,
            detail=f"Deposit not paid for this ticket (payment_status={booking.payment_status})",
        )

    balance_cents = booking.balance_amount_cents or 0
    balance_dollars = f"${balance_cents / 100:.2f}"
    venue_name = venue.name
    slot = f"{booking.deal.date} {booking.slot_time}"
    payment_warning: Optional[str] = None

    if balance_cents > 0:
        try:
            payment = payments.charge_balance(
                payer_id=booking.pinch_payer_id,
                source_id=booking.pinch_source_id,
                amount_cents=balance_cents,
                application_fee_cents=round(balance_cents * 0.20),
                description=f"Impulse balance — {venue_name} {slot}",
                metadata={
                    "impulseBookingId": booking.id,
                    "type": "balance",
                    "balanceAmountCents": balance_cents,
                },
                nonce=f"balance-{booking.id}",
                merchant_id=PINCH_MERCHANT_ID,
            )
            booking.balance_payment_id = payment["id"]
            booking.payment_status = "fully_paid"
            # In-app customer notification (Plans screen)
            booking.payment_note = (
                f"Your booking at {venue_name} has been confirmed — "
                f"{balance_dollars} has been charged to your card. Enjoy!"
            )
        except PinchError as e:
            logger.error(
                "Pinch balance charge failed for booking %s: %s %s",
                booking.id, e.status_code, e.body,
            )
            # Do not block redemption — flag for follow-up, venue collects directly
            payment_warning = "Card declined, please collect payment directly"
            booking.payment_followup = True
            booking.payment_note = (
                f"We couldn't charge your card for the balance — "
                f"please settle {balance_dollars} directly with the venue."
            )
    else:
        booking.payment_status = "fully_paid"

    booking.status = "attended"
    booking.redeemed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(booking)

    return RedeemResponse(
        confirmation_code=booking.confirmation_code,
        status=booking.status,
        slot_time=booking.slot_time,
        num_people=booking.num_people,
        redeemed_at=booking.redeemed_at,
        payment_status=booking.payment_status,
        balance_amount_cents=booking.balance_amount_cents,
        payment_warning=payment_warning,
    )
