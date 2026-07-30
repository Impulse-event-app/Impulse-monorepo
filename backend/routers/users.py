import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import payments
import pinch_client
import wallet
from auth import get_current_user
from database import get_db
from models import PaymentMethod, User
from schemas import (
    PaymentMethodCreate,
    PaymentMethodResponse,
    PushTokenRegister,
    UserResponse,
    UserUpdate,
)

logger = logging.getLogger("impulse.users")

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def get_me(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return the calling user's profile."""
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        raise HTTPException(status_code=404, detail="User profile not found")
    return row


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UserUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update (or create) the calling user's onboarding / profile fields."""
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        # First-time sign-in via email/password — create the row now.
        row = User(id=user["sub"], email=user.get("email"))
        db.add(row)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.put("/me/push-token", status_code=204)
def register_push_token(
    body: PushTokenRegister,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Store the caller's Expo push token (for huddle + booking notifications)."""
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        row = User(id=user["sub"], email=user.get("email"))
        db.add(row)
    row.expo_push_token = body.expo_push_token
    db.commit()


# ── Saved cards ───────────────────────────────────────────────────────────────
# One Pinch payer per user, created once; each saved card is a source vaulted
# against it. This is what stops a returning customer minting a fresh payer on
# every booking.


def _get_or_create_user(db: Session, user: dict) -> User:
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        row = User(id=user["sub"], email=user.get("email"))
        db.add(row)
        db.flush()
    return row


@router.get("/me/payment-methods", response_model=List[PaymentMethodResponse])
def list_payment_methods(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """The caller's saved cards, default first then newest."""
    return (
        db.query(PaymentMethod)
        .filter(PaymentMethod.user_id == user["sub"])
        .order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.desc())
        .all()
    )


@router.post("/me/payment-methods", response_model=PaymentMethodResponse, status_code=201)
def add_payment_method(
    body: PaymentMethodCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Vault a CaptureJs token against the caller's payer and keep it on file."""
    row = _get_or_create_user(db, user)
    payer_id = wallet.ensure_payer(
        row, first_name=body.first_name, last_name=body.last_name, email=body.email,
    )

    try:
        source = payments.vault_source(
            payer_id=payer_id, token=body.token, merchant_id=wallet.PINCH_MERCHANT_ID,
        )
    except payments.PinchError as exc:
        # Roll back the payer we may have just created rather than leaving the
        # user pointing at one with no usable card.
        db.rollback()
        logger.warning("Vaulting a card failed for user %s: %s %s",
                       user["sub"], exc.status_code, exc.body)
        raise HTTPException(status_code=402, detail="That card couldn't be saved.")

    # save_source() always makes the new card default, which is right for the
    # first one and for an explicit request; otherwise keep the existing default.
    previous_default = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.user_id == row.id, PaymentMethod.is_default == True)
        .first()
    )
    method = wallet.save_source(db, row, source)
    if previous_default and not body.make_default:
        method.is_default = False
        db.flush()
        previous_default.is_default = True

    db.commit()
    db.refresh(method)
    return method


@router.delete("/me/payment-methods/{method_id}", status_code=204)
def delete_payment_method(
    method_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Detach a saved card from Pinch and forget it locally."""
    method = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.id == method_id, PaymentMethod.user_id == user["sub"])
        .first()
    )
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")

    row = db.query(User).filter(User.id == user["sub"]).first()
    if row and row.pinch_payer_id:
        try:
            pinch_client.delete_source(
                row.pinch_payer_id, method.pinch_source_id, wallet.PINCH_MERCHANT_ID,
            )
        except payments.PinchError as exc:
            # A source Pinch no longer knows about (400 "not found") should
            # still disappear from the user's wallet — anything else is a real
            # failure and must not silently leave a card the user believes is gone.
            if exc.status_code != 400:
                logger.error("Detaching source %s failed: %s %s",
                             method.pinch_source_id, exc.status_code, exc.body)
                raise HTTPException(status_code=502, detail="Couldn't remove that card. Try again.")
            logger.info("Source %s already gone from Pinch; removing locally", method.pinch_source_id)

    was_default = method.is_default
    db.delete(method)
    db.flush()

    # Promote the newest survivor so the user always has a default to pay with.
    if was_default:
        survivor = (
            db.query(PaymentMethod)
            .filter(PaymentMethod.user_id == user["sub"])
            .order_by(PaymentMethod.created_at.desc())
            .first()
        )
        if survivor:
            survivor.is_default = True

    db.commit()
