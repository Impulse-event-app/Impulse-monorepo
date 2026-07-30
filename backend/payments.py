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

# Impulse's cut of the balance charge. The deposit has no rate — Impulse keeps
# all of it (applicationFee == amount), which is why there is no constant for it.
BALANCE_APPLICATION_FEE_RATE = 0.20


class PaymentNotApproved(PinchError):
    """A charge returned a non-approved status. Carries the payment body."""


def create_payer(*, first_name: str, last_name: str, email: str, merchant_id: str) -> str:
    """Create a Pinch payer and return its id (pyr_XXX)."""
    payer = pinch_client.create_payer(
        {"firstName": first_name, "lastName": last_name, "email": email},
        merchant_id,
    )
    return payer["id"]


def vault_source(*, payer_id: str, token: str, merchant_id: str) -> dict:
    """Vault a CaptureJs token against an existing payer. Returns the full
    source object — callers persist id plus the display fields
    (displayCardNumber, cardScheme, expiryDate, funding, cardHolderName)."""
    return pinch_client.create_payment_source(
        payer_id, {"sourceType": "credit-card", "token": token}, merchant_id,
    )


def vault_card(*, first_name: str, last_name: str, email: str, token: str, merchant_id: str):
    """Create a payer and vault a card against it in one step.

    Kept for the throwaway path — a card used for exactly one booking and never
    saved. Saved cards go through create_payer + vault_source so the payer can
    be reused, which is what stops a returning customer minting a fresh payer
    on every booking."""
    payer_id = create_payer(
        first_name=first_name, last_name=last_name, email=email, merchant_id=merchant_id,
    )
    source = vault_source(payer_id=payer_id, token=token, merchant_id=merchant_id)
    return payer_id, source["id"]


def source_is_chargeable(*, payer_id: str, source_id: str, merchant_id: str) -> bool:
    """Whether a stored source can still be charged via the realtime endpoint.

    Pinch has no list-sources endpoint — the payer object embeds `sources`, and
    each carries `supportsRealtime`. Checking it before a saved-card charge is
    the cleanest guard against a card that vaulted fine but can't be charged
    synchronously. Unknown sources return False."""
    payer = pinch_client.get_payer(payer_id, merchant_id)
    for source in payer.get("sources") or []:
        if source.get("id") == source_id:
            return bool(source.get("supportsRealtime"))
    return False


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
