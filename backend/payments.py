"""
Shared Pinch payment orchestration — the single source of truth for how
Impulse vaults cards and charges deposits/balances. Both the single-booking
flow (routers/bookings.py) and the huddle group flow (routers/huddles.py) call
these, so the fee model, surcharge rules, metadata encoding, and nonce handling
live in exactly one place.

Fee model (revised 2026-07-30):
- Deposit: the confirming 20% is Impulse's entire take. Impulse keeps the full
  amount (applicationFee = amount). Pinch caps applicationFee at amount −
  transaction fees, so card fees are surcharged to the customer. Metadata MUST
  be a JSON string — an object nulls Pinch's request.
- Balance: no application fee. The balance belongs to the venue in full; the
  customer pays exactly the quoted balance and the venue absorbs Pinch's fees.

Superseded: the balance previously carried a 20% applicationFee, which stacked
with the deposit to a 36% effective take. Impulse's take is now the deposit and
nothing else.

Note this is the *fee* split, not the *routing*. Both charges still run through
the single Impulse merchant, so a zero application fee means Impulse collects
the balance and owes it onward. Routing the balance to each venue's own managed
merchant is what makes the money actually land in their account.
"""
import json

import pinch_client
from pinch_client import PinchError  # re-exported for callers

# Impulse's cut of the balance charge. Zero by decision (2026-07-30): the whole
# 20% deposit is Impulse's take, and the balance is entirely the venue's.
# Previously 0.20, which stacked to a 36% effective take once the deposit was
# counted. Kept as a constant rather than inlined so reinstating a balance fee
# is one edit — settlements, payouts and the seed script all read it.
BALANCE_APPLICATION_FEE_RATE = 0.0


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


def _replayed_payment(err: PinchError, amount_cents: int) -> dict:
    """A reused nonce comes back as HTTP 403 {"isNonceReplay": true, "data":
    <the original payment>} — and Pinch ignores the amount on the retry
    (probed in sandbox 2026-09-26). So a replay only counts as our charge when
    the original was approved for exactly the amount we meant to charge now;
    anything else re-raises with Pinch's exact body.

    `amount` on a surcharged payment includes the card fee, so the intended
    amount is read back from the chargeAmountCents we stamp into metadata."""
    if err.status_code != 403:
        raise err
    try:
        body = json.loads(err.body)
    except ValueError:
        raise err
    payment = body.get("data") if isinstance(body, dict) and body.get("isNonceReplay") else None
    if not payment:
        raise err
    try:
        meta = json.loads(payment.get("metadata") or "{}")
    except ValueError:
        meta = {}
    charged = meta.get("chargeAmountCents")
    if charged is None and not payment.get("isSurcharged"):
        charged = payment.get("amount")
    if charged != amount_cents:
        raise err
    return _require_approved(payment)


def _create_payment(input: dict, merchant_id: str) -> dict:
    """POST the charge; a nonce replay of the same approved charge is success."""
    try:
        payment = pinch_client.create_payment(input, merchant_id)
    except PaymentNotApproved:
        raise
    except PinchError as e:
        return _replayed_payment(e, input["amount"])
    return _require_approved(payment)


def charge_deposit(*, payer_id: str, source_id: str, amount_cents: int,
                   description: str, metadata: dict, nonce: str, merchant_id: str) -> dict:
    """Charge a deposit: full amount is Impulse's, card fees surcharged to the
    customer. Returns the approved payment. Raises PinchError / PaymentNotApproved."""
    return _create_payment(
        {
            "payerId": payer_id,
            "sourceId": source_id,
            "amount": amount_cents,
            "applicationFee": amount_cents,
            "surcharge": ["credit-card"],
            "description": description,
            "metadata": json.dumps({**metadata, "chargeAmountCents": amount_cents}),
            "nonce": nonce,
        },
        merchant_id,
    )


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
    return _create_payment(
        {
            "payerId": payer_id,
            "sourceId": source_id,
            "amount": amount_cents,
            "applicationFee": application_fee_cents,
            "description": description,
            "metadata": json.dumps({**metadata, "chargeAmountCents": amount_cents}),
            "nonce": nonce,
        },
        merchant_id,
    )
