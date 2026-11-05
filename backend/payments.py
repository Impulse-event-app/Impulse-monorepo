"""
Shared Stripe payment orchestration — the single source of truth for how
Impulse holds, captures and releases a seat's money, and for the fee model.
The booking flow (booking_flow.py) and the wallet (wallet.py) call these; they
never talk to Stripe directly.

Money flow (decided 2026-11-05, replacing Pinch's deposit-then-balance):
- Claiming a spot places a HOLD for the seat's whole share: a destination
  PaymentIntent with capture_method=manual on Impulse's platform account,
  transfer_data.destination = the venue's connected account. Nothing moves.
- The venue redeeming the six-digit code CAPTURES the hold; Stripe moves the
  money to the venue, minus `application_fee_amount`, and booking_flow then
  asks payouts.py for an Instant Payout.
- A Huddle that collapses CANCELS its holds — no refund, no fee.
- A no-show captures only the seat's 10% (`deposit_cents`) after the grace
  window and releases the rest, so the deposit stays non-refundable.

Fee model (impulse_fee):
- During a venue's free pilot (venue.pilot_ends_at in the future, or unset),
  Impulse takes nothing: the venue gets 100%, and Impulse quietly pays
  Stripe's card fee and the 1% Instant Payout fee.
- After the pilot, Impulse's cut is a flat 10%: the seat's deposit_cents.
  Impulse keeps absorbing Stripe's card fee and the Instant Payout fee
  (decided 2026-11-05), so venues see exactly 90% of every booking. With
  destination charges Stripe bills those fees to the platform, so absorbing
  them needs no extra code; they simply come out of Impulse's 10%.

Card holds last 7 days for a customer-initiated authorisation (Visa about
4d18h for merchant-initiated), and allow one capture. Bookings further out than
HOLD_AHEAD save the card with a SetupIntent instead; the sweep places the hold
closer to the slot.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import stripe_client
from stripe_client import CURRENCY

# How far ahead of the slot a hold can be placed at claim time and still be
# valid at check-in (customer-initiated holds last 7 days).
HOLD_AHEAD = timedelta(days=6)
# When the sweep places a merchant-initiated hold for a far-off booking. Visa's
# MIT window is 4 days 18 hours, so this keeps a margin past the slot.
OFFSESSION_HOLD_LEAD = timedelta(days=4)


class PaymentError(Exception):
    """Any failed Stripe call. Carries an HTTP-ish status and a readable body
    so the booking flow can log and surface it the way it did for Pinch."""

    def __init__(self, status_code: int, body: str):
        self.status_code = status_code
        self.body = body
        super().__init__(f"Payment error {status_code}: {body}")


class PaymentNotApproved(PaymentError):
    """The card said no — a decline or failed authentication. Definitive."""


def _wrap(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except stripe_client.CardError as e:
        raise PaymentNotApproved(402, e.user_message or str(e))
    except stripe_client.StripeError as e:
        raise PaymentError(e.http_status or 0, e.user_message or str(e))


# ── Fee model ────────────────────────────────────────────────────────────────

def in_pilot(venue, at: Optional[datetime] = None) -> bool:
    """A venue with no pilot end date is treated as still in its pilot, so a
    forgotten date never charges a venue that was promised free."""
    ends = getattr(venue, "pilot_ends_at", None)
    if ends is None:
        return True
    at = at or datetime.now(timezone.utc)
    if ends.tzinfo is None:
        ends = ends.replace(tzinfo=timezone.utc)
    return at < ends


def impulse_fee(*, venue, deposit_cents: int, captured_cents: int,
                at: Optional[datetime] = None) -> int:
    """The application_fee_amount for one capture — the only place the fee
    model lives: 0 during the venue's pilot, a flat 10% (the seat's deposit)
    after it, never more than what was captured. See the module docstring."""
    if captured_cents <= 0 or in_pilot(venue, at):
        return 0
    return min(deposit_cents or 0, captured_cents)


# ── Holds ────────────────────────────────────────────────────────────────────

def needs_setup_first(slot_start: Optional[datetime], at: Optional[datetime] = None) -> bool:
    """True when a hold placed now would expire before check-in."""
    if slot_start is None:
        return False
    at = at or datetime.now(timezone.utc)
    return slot_start - at > HOLD_AHEAD


def create_hold(*, customer_id: str, amount_cents: int, destination: str,
                description: str, metadata: dict, idempotency_key: str) -> dict:
    """An on-session hold the app confirms through PaymentSheet (which handles
    3DS, Apple Pay and Google Pay). The card is saved to the platform Customer
    so the same card can be re-held or cover a friend later, at any venue."""
    return _wrap(stripe_client.create_payment_intent, {
        "amount": amount_cents,
        "currency": CURRENCY,
        "customer": customer_id,
        "capture_method": "manual",
        "setup_future_usage": "off_session",
        "transfer_data": {"destination": destination},
        "description": description,
        "metadata": metadata,
    }, idempotency_key)


def place_offsession_hold(*, customer_id: str, payment_method_id: str, amount_cents: int,
                          destination: str, description: str, metadata: dict,
                          idempotency_key: str) -> dict:
    """A hold the server places itself on a saved card — a far-off booking as
    its slot nears, or the initiator covering an unpaid seat. Raises
    PaymentNotApproved when the card declines or wants the guest present."""
    pi = _wrap(stripe_client.create_payment_intent, {
        "amount": amount_cents,
        "currency": CURRENCY,
        "customer": customer_id,
        "payment_method": payment_method_id,
        "capture_method": "manual",
        "off_session": True,
        "confirm": True,
        "transfer_data": {"destination": destination},
        "description": description,
        "metadata": metadata,
    }, idempotency_key)
    if pi.get("status") != "requires_capture":
        raise PaymentNotApproved(402, f"hold not placed (status={pi.get('status')})")
    # Read back expanded, so callers get the card country and capture_before.
    return retrieve_hold(pi["id"])


def create_setup(*, customer_id: str, metadata: dict, idempotency_key: str) -> dict:
    """Save a card now, hold it later (bookings more than HOLD_AHEAD out)."""
    return _wrap(stripe_client.create_setup_intent, {
        "customer": customer_id,
        "usage": "off_session",
        "metadata": metadata,
    }, idempotency_key)


def retrieve_hold(intent_id: str) -> dict:
    return _wrap(stripe_client.retrieve_payment_intent, intent_id)


def retrieve_setup(intent_id: str) -> dict:
    return _wrap(stripe_client.retrieve_setup_intent, intent_id)


def _id(value) -> Optional[str]:
    """An expandable field: either the id string or the expanded object."""
    if isinstance(value, dict):
        return value.get("id")
    return value


def payment_method_of(intent: dict) -> Optional[str]:
    return _id(intent.get("payment_method"))


def hold_expires_at(intent: dict) -> Optional[datetime]:
    """When the authorisation lapses (charge.payment_method_details.card.capture_before)."""
    charge = intent.get("latest_charge")
    if isinstance(charge, dict):
        ts = ((charge.get("payment_method_details") or {}).get("card") or {}).get("capture_before")
        if ts:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc)
    return None


def capture(*, intent_id: str, amount_cents: int, application_fee_cents: int,
            idempotency_key: str) -> dict:
    """Capture `amount_cents` of a hold (less releases the rest). Raises
    PaymentNotApproved when the hold has lapsed or was cancelled."""
    pi = _wrap(stripe_client.capture_payment_intent, intent_id, {
        "amount_to_capture": amount_cents,
        "application_fee_amount": application_fee_cents,
    }, idempotency_key)
    if pi.get("status") != "succeeded":
        raise PaymentNotApproved(402, f"capture failed (status={pi.get('status')})")
    return pi


def cancel_hold(*, intent_id: str, idempotency_key: str) -> None:
    """Release a hold. One that is already cancelled or lapsed counts as released."""
    try:
        stripe_client.cancel_payment_intent(intent_id, idempotency_key)
    except stripe_client.StripeError as e:
        code = getattr(e, "code", None)
        if code == "payment_intent_unexpected_state":
            return
        raise PaymentError(e.http_status or 0, e.user_message or str(e))


def refund_captured(*, intent_id: str, reason: str, idempotency_key: str) -> dict:
    """Refund a captured seat in full, pulling the money back from the venue
    and returning Impulse's fee. Not used by the normal flow — captured money
    is the venue's — but kept for support and disputes."""
    return _wrap(stripe_client.create_refund, {
        "payment_intent": intent_id,
        "reverse_transfer": True,
        "refund_application_fee": True,
        "metadata": {"reason": reason},
    }, idempotency_key)
