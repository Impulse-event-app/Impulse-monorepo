"""
Saved-card logic — the DB-aware half of the Stripe integration.

Each Impulse user has one Stripe Customer on the platform account
(users.stripe_customer_id), created on first need and reused forever. Because
every charge is a destination charge on the platform, that one Customer's cards
work at every venue.

Stripe is the source of truth for the cards themselves: PaymentSheet saves them
when a guest holds a spot, and the wallet endpoints list and detach them
straight from Stripe. Nothing card-shaped is stored locally beyond the
PaymentMethod id a seat was held with.
"""
import logging
from typing import List, Optional

from fastapi import HTTPException

import stripe_client
from models import User

logger = logging.getLogger("impulse.wallet")


def ensure_customer(row: User) -> str:
    """The user's Stripe Customer id, created once. The idempotency key is the
    user id, so two racing requests end up with the same Customer."""
    if not row.stripe_customer_id:
        try:
            customer = stripe_client.create_customer(
                email=row.email, name=row.full_name, user_id=row.id,
            )
        except stripe_client.StripeError as e:
            logger.error("Creating a Stripe customer for user %s failed: %s", row.id, e)
            raise HTTPException(status_code=502, detail="Couldn't set up payments. Try again.")
        row.stripe_customer_id = customer["id"]
    return row.stripe_customer_id


def sheet_params(row: User) -> dict:
    """What PaymentSheet needs to show and save this user's cards."""
    customer_id = ensure_customer(row)
    try:
        session = stripe_client.create_customer_session(customer_id)
    except stripe_client.StripeError as e:
        logger.error("Creating a customer session for user %s failed: %s", row.id, e)
        raise HTTPException(status_code=502, detail="Couldn't open payments. Try again.")
    return {"customer_id": customer_id, "customer_session_client_secret": session["client_secret"]}


def card_view(pm: dict, default_id: Optional[str]) -> dict:
    """A Stripe card PaymentMethod in the shape the app already renders:
    bare last 4, lowercase brand, MM/YY expiry."""
    card = pm.get("card") or {}
    month, year = card.get("exp_month"), card.get("exp_year")
    return {
        "id": pm["id"],
        "card_scheme": card.get("display_brand") or card.get("brand"),
        "display_card_number": card.get("last4"),
        "expiry_date": f"{month:02d}/{year % 100:02d}" if month and year else None,
        "card_holder_name": (pm.get("billing_details") or {}).get("name"),
        "funding": card.get("funding"),
        "is_default": pm["id"] == default_id,
        "wallet": (card.get("wallet") or {}).get("type"),
    }


def list_cards(row: Optional[User]) -> List[dict]:
    """The user's saved cards, default first then newest."""
    if not row or not row.stripe_customer_id:
        return []
    try:
        customer = stripe_client.retrieve_customer(row.stripe_customer_id)
        methods = stripe_client.list_cards(row.stripe_customer_id)
    except stripe_client.StripeError as e:
        logger.error("Listing cards for user %s failed: %s", row.id, e)
        raise HTTPException(status_code=502, detail="Couldn't load your cards. Try again.")
    default_id = ((customer.get("invoice_settings") or {}).get("default_payment_method"))
    if isinstance(default_id, dict):
        default_id = default_id.get("id")
    if not default_id and methods:
        default_id = max(methods, key=lambda m: m.get("created") or 0)["id"]
    cards = [card_view(m, default_id) for m in methods]
    return sorted(cards, key=lambda c: (not c["is_default"],
                                        -next(m.get("created") or 0 for m in methods if m["id"] == c["id"])))


def owns_card(row: User, payment_method_id: str) -> bool:
    return any(c["id"] == payment_method_id for c in list_cards(row))
