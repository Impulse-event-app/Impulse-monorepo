"""Stripe Connect onboarding for a venue.

A venue becomes a Stripe connected account (Accounts v2, recipient
configuration) so each booking's money is transferred to it when the venue
redeems the code, and paid out to its bank within minutes. Stripe collects and
verifies everything — business details, bank account, directors, ID — through
the embedded onboarding component in venue-web, so nothing identity-shaped
passes through this backend any more.

Flow:
  POST /merchants/venues/{id}                  create the connected account (once)
  POST /merchants/venues/{id}/account-session  client secret for the embedded
                                               onboarding / payouts / notification components
  GET  /merchants/venues/{id}/status           live capability status + what's outstanding

A venue can publish deals only once its stripe_transfers capability is active
(can_publish_deals), because a destination charge to an account that can't
receive transfers fails.
"""
import calendar
import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import stripe_client
from auth import get_current_user
from database import get_db
from models import User, Venue
from routers.venues import _assert_owner, _get_venue_or_404
from schemas import AccountSessionResponse, PaymentsStatusResponse
import payments

logger = logging.getLogger("impulse.merchants")

router = APIRouter()

PILOT_MONTHS = 3

# The embedded components venue-web renders. Notification banner is what keeps
# an account healthy as Stripe's requirements change, so it is always on.
_COMPONENTS = {
    "account_onboarding": {"enabled": True},
    "notification_banner": {"enabled": True},
    "account_management": {"enabled": True},
    "payouts": {"enabled": True, "features": {
        "instant_payouts": True, "standard_payouts": True, "edit_payout_schedule": False,
    }},
}


def require_owned_venue(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Venue:
    """The server-side authorisation for every route in this file."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    return venue


def add_months(at: datetime, months: int) -> datetime:
    month = at.month - 1 + months
    year, month = at.year + month // 12, month % 12 + 1
    day = min(at.day, calendar.monthrange(year, month)[1])
    return at.replace(year=year, month=month, day=day)


# ── Status ───────────────────────────────────────────────────────────────────

def _transfers_status(account: dict) -> str:
    caps = (((account.get("configuration") or {}).get("recipient") or {}).get("capabilities") or {})
    transfers = ((caps.get("stripe_balance") or {}).get("stripe_transfers") or {})
    return transfers.get("status") or "pending"


def _due_entries(account: dict) -> List[dict]:
    """Requirements that block the account now, in plain words."""
    entries = ((account.get("requirements") or {}).get("entries") or [])
    due = []
    for e in entries:
        deadline = (e.get("minimum_deadline") or {}).get("status")
        if deadline in ("currently_due", "past_due"):
            due.append({"description": e.get("description"), "deadline": deadline,
                        "awaiting_action_from": e.get("awaiting_action_from")})
    return due


def sync_account(db: Session, venue: Venue) -> dict:
    """Re-read the account from Stripe and store its state. Used by the status
    endpoint and the account webhook, so a missed event can't leave a venue
    looking stuck."""
    account = stripe_client.retrieve_account(venue.stripe_account_id)
    previous = venue.stripe_transfers_status
    venue.stripe_transfers_status = _transfers_status(account)
    venue.stripe_requirements = _due_entries(account)
    venue.stripe_status_updated_at = datetime.now(timezone.utc)
    db.commit()
    if previous != "active" and venue.stripe_transfers_status == "active":
        logger.info("Venue %s can now take payments", venue.id)
    return account


def can_publish_deals(venue: Venue) -> bool:
    """A published deal takes holds on guests' cards, which only work once the
    venue's account can receive transfers."""
    return bool(venue.stripe_account_id) and venue.stripe_transfers_status == "active"


def _status(venue: Venue) -> PaymentsStatusResponse:
    due = venue.stripe_requirements or []
    if not venue.stripe_account_id:
        outstanding = ["Set up payments so your takings reach your bank"]
    else:
        outstanding = [d.get("description") or "More information is needed" for d in due]
    return PaymentsStatusResponse(
        venue_id=venue.id,
        stripe_account_id=venue.stripe_account_id,
        transfers_status=venue.stripe_transfers_status,
        can_publish_deals=can_publish_deals(venue),
        outstanding=outstanding,
        updated_at=venue.stripe_status_updated_at,
        pilot_ends_at=venue.pilot_ends_at,
        in_pilot=payments.in_pilot(venue),
    )


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/venues/{venue_id}", response_model=PaymentsStatusResponse, status_code=201)
def create_account(
    venue: Venue = Depends(require_owned_venue),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create the venue's connected account. Idempotent per venue: asking again
    returns the existing account. Also starts the venue's free pilot clock if
    Impulse hasn't set one by hand."""
    if venue.stripe_account_id:
        return _status(venue)
    owner = db.query(User).filter(User.id == venue.owner_id).first()
    email = venue.email or (owner.email if owner else None) or user.get("email")
    try:
        account = stripe_client.create_connected_account({
            "contact_email": email,
            "display_name": venue.name,
            "identity": {"country": "au"},
            "dashboard": "express",
            "defaults": {"responsibilities": {
                "fees_collector": "application",
                "losses_collector": "application",
            }},
            "configuration": {"recipient": {"capabilities": {
                "stripe_balance": {"stripe_transfers": {"requested": True}},
            }}},
            "metadata": {"impulseVenueId": str(venue.id)},
        }, idempotency_key=f"account-{venue.id}")
    except stripe_client.StripeError as e:
        logger.error("Creating a Stripe account for venue %s failed: %s", venue.id, e)
        raise HTTPException(status_code=502, detail="Couldn't start payments setup. Try again.")

    venue.stripe_account_id = account["id"]
    venue.stripe_transfers_status = _transfers_status(account)
    venue.stripe_requirements = _due_entries(account)
    venue.stripe_status_updated_at = datetime.now(timezone.utc)
    if venue.pilot_ends_at is None:
        venue.pilot_ends_at = add_months(datetime.now(timezone.utc), PILOT_MONTHS)
    db.commit()
    db.refresh(venue)
    logger.info("Venue %s: Stripe account %s created", venue.id, venue.stripe_account_id)
    return _status(venue)


@router.post("/venues/{venue_id}/account-session", response_model=AccountSessionResponse)
def account_session(venue: Venue = Depends(require_owned_venue)):
    """A short-lived client secret for Connect embedded components."""
    if not venue.stripe_account_id:
        raise HTTPException(status_code=409, detail="Start payments setup first")
    try:
        session = stripe_client.create_account_session(venue.stripe_account_id, _COMPONENTS)
    except stripe_client.StripeError as e:
        logger.error("Account session for venue %s failed: %s", venue.id, e)
        raise HTTPException(status_code=502, detail="Couldn't open payments. Try again.")
    return AccountSessionResponse(client_secret=session["client_secret"])


@router.get("/venues/{venue_id}/status", response_model=PaymentsStatusResponse)
def get_status(
    venue: Venue = Depends(require_owned_venue),
    db: Session = Depends(get_db),
):
    """Stored status, refreshed from Stripe."""
    if venue.stripe_account_id:
        try:
            sync_account(db, venue)
        except stripe_client.StripeError as e:
            logger.error("Could not refresh Stripe status for venue %s: %s", venue.id, e)
            db.rollback()
    return _status(venue)
