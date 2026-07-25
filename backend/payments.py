"""
Shared Pinch payment orchestration — the single source of truth for how
Impulse vaults cards and charges deposits/balances. Both the single-booking
flow (routers/bookings.py) and the huddle group flow (routers/huddles.py) call
these, so the fee model, surcharge rules, metadata encoding, and nonce handling
live in exactly one place.

Fee model (decided 2026-07-25):
- Deposit: Impulse keeps the full amount (applicationFee = amount). Pinch caps
  applicationFee at amount − transaction fees, so card fees are surcharged to
  the customer. Metadata MUST be a JSON string — an object nulls Pinch's request.
- Balance: Impulse takes applicationFee (20% of balance), no surcharge — the
  customer pays exactly the quoted balance and the venue absorbs Pinch's fees.
"""
import json

import pinch_client
from pinch_client import PinchError  # re-exported for callers


class PaymentNotApproved(PinchError):
    """A charge returned a non-approved status. Carries the payment body."""


def vault_card(*, first_name: str, last_name: str, email: str, token: str, merchant_id: str):
    """Create a Pinch payer and vault a CaptureJs card token as a reusable
    source. Returns (payer_id, source_id). Raises PinchError on failure."""
    payer = pinch_client.create_payer(
        {"firstName": first_name, "lastName": last_name, "email": email},
        merchant_id,
    )
    source = pinch_client.create_payment_source(
        payer["id"], {"sourceType": "credit-card", "token": token}, merchant_id,
    )
    return payer["id"], source["id"]


def _require_approved(payment: dict) -> dict:
    if str(payment.get("status", "")).lower() != "approved":
        raise PaymentNotApproved(200, json.dumps(payment))
    return payment


def charge_deposit(*, payer_id: str, source_id: str, amount_cents: int,
                   description: str, metadata: dict, nonce: str, merchant_id: str) -> dict:
    """Charge a deposit: full amount is Impulse's, card fees surcharged to the
    customer. Returns the approved payment. Raises PinchError / PaymentNotApproved."""
    payment = pinch_client.create_payment(
        {
            "payerId": payer_id,
            "sourceId": source_id,
            "amount": amount_cents,
            "applicationFee": amount_cents,
            "surcharge": ["credit-card"],
            "description": description,
            "metadata": json.dumps(metadata),
            "nonce": nonce,
        },
        merchant_id,
    )
    return _require_approved(payment)


def refund_full(*, payment_id: str, reason: str, nonce: str, merchant_id: str) -> dict:
    """Fully refund a prior payment — the actual captured amount (deposit share
    plus any card-fee surcharge), so the member is made whole and no sub-minimum
    remainder is left (Pinch rejects refunds that would leave < $1 on a payment).

    Used only when a huddle plan collapses before it becomes a real booking —
    confirmed single-booking deposits are never refunded. Idempotent on nonce."""
    payment = pinch_client.get_payment(payment_id, merchant_id)
    amount = payment.get("amount")
    if not amount:
        raise PinchError(200, f"payment {payment_id} has no amount to refund: {payment}")
    return pinch_client.create_refund(
        {"paymentId": payment_id, "amount": amount, "reason": reason, "nonce": nonce},
        merchant_id,
    )


def charge_balance(*, payer_id: str, source_id: str, amount_cents: int,
                   application_fee_cents: int, description: str, metadata: dict,
                   nonce: str, merchant_id: str) -> dict:
    """Charge a balance: Impulse takes application_fee_cents, no surcharge.
    Returns the approved payment. Raises PinchError / PaymentNotApproved."""
    payment = pinch_client.create_payment(
        {
            "payerId": payer_id,
            "sourceId": source_id,
            "amount": amount_cents,
            "applicationFee": application_fee_cents,
            "description": description,
            "metadata": json.dumps(metadata),
            "nonce": nonce,
        },
        merchant_id,
    )
    return _require_approved(payment)
