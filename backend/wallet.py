"""
Saved-card logic — the DB-aware half of the Pinch integration.

payments.py stays pure orchestration (it talks to Pinch and nothing else);
this module owns the mapping between Impulse users and their Pinch payer and
vaulted sources. Both the single-booking flow and the huddle flow resolve a
card through resolve_source() so "pay with a saved card" behaves identically
in each.
"""
import logging
import os
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

import payments
from models import PaymentMethod, User

logger = logging.getLogger("impulse.wallet")

PINCH_MERCHANT_ID: str = os.environ["PINCH_TEST_MERCHANT_ID"]


def ensure_payer(row: User, *, first_name: str, last_name: str, email: str) -> str:
    """The user's Pinch payer id, created once and reused for every later card."""
    if not row.pinch_payer_id:
        row.pinch_payer_id = payments.create_payer(
            first_name=first_name, last_name=last_name, email=email,
            merchant_id=PINCH_MERCHANT_ID,
        )
    return row.pinch_payer_id


def save_source(db: Session, row: User, source: dict) -> PaymentMethod:
    """Persist a freshly vaulted Pinch source as a card on file, made default."""
    method = PaymentMethod(
        user_id=row.id,
        pinch_source_id=source["id"],
        card_scheme=source.get("cardScheme"),
        display_card_number=source.get("displayCardNumber"),
        expiry_date=source.get("expiryDate"),
        card_holder_name=source.get("cardHolderName"),
        funding=source.get("funding"),
    )
    db.add(method)
    db.flush()
    db.query(PaymentMethod).filter(
        PaymentMethod.user_id == row.id, PaymentMethod.id != method.id
    ).update({"is_default": False})
    method.is_default = True
    return method


def resolve_source(
    db: Session,
    row: User,
    *,
    payment_method_id: Optional[str],
    token: Optional[str],
    save_card: bool,
    first_name: Optional[str],
    last_name: Optional[str],
    email: Optional[str],
) -> Tuple[str, str]:
    """Return (payer_id, source_id) ready to charge.

    Saved card  → verified chargeable, then reused.
    New token   → vaulted against the user's payer, kept only if save_card.

    Raises HTTPException on anything the caller should surface to the user;
    PinchError propagates for the caller's existing 402 handling."""
    if payment_method_id:
        method = (
            db.query(PaymentMethod)
            .filter(PaymentMethod.id == payment_method_id, PaymentMethod.user_id == row.id)
            .first()
        )
        if not method:
            raise HTTPException(status_code=404, detail="Saved card not found")
        if not row.pinch_payer_id:
            # Shouldn't happen — a saved card implies a payer. Treat as corrupt
            # rather than charging against a payer id we don't have.
            logger.error("User %s has a saved card but no pinch_payer_id", row.id)
            raise HTTPException(status_code=409, detail="Saved card is unusable. Add the card again.")

        if not payments.source_is_chargeable(
            payer_id=row.pinch_payer_id,
            source_id=method.pinch_source_id,
            merchant_id=PINCH_MERCHANT_ID,
        ):
            # Vaulted fine at some point but can't be charged synchronously now
            # (expired, detached at Pinch's end, never authorised).
            raise HTTPException(
                status_code=409,
                detail="That saved card can no longer be charged. Please use another card.",
            )
        return row.pinch_payer_id, method.pinch_source_id

    payer_id = ensure_payer(row, first_name=first_name, last_name=last_name, email=email)
    source = payments.vault_source(payer_id=payer_id, token=token, merchant_id=PINCH_MERCHANT_ID)
    if save_card:
        save_source(db, row, source)
    return payer_id, source["id"]
