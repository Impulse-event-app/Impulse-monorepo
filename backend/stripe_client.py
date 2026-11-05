"""
Thin client for Stripe (Connect marketplace, destination charges).

Docs: https://docs.stripe.com/connect/destination-charges
Test vs live is decided by the key alone (rk_test_/sk_test_ vs rk_live_/sk_live_);
there is no base URL to switch. Prefer a restricted key (rk_) in every environment.

Everything Impulse sells is a destination charge: the PaymentIntent lives on
Impulse's platform account, so a guest's Customer and saved cards are shared
across every venue, and `transfer_data.destination` names the venue's connected
account that receives the money. Impulse's cut is `application_fee_amount`,
set when the hold is captured.

Venues are Accounts v2 connected accounts with the recipient configuration
(dashboard "express", fees and losses collected by the platform), per Stripe's
marketplace guidance. Everything else uses the v1 API, which is where
PaymentIntents, Customers and payouts still live.

Every helper returns a plain dict (StripeObject.to_dict()), so callers and tests
never depend on SDK types. Errors propagate as stripe.StripeError subclasses;
payments.py maps them.
"""
import os
from typing import Optional

import stripe
from dotenv import load_dotenv

load_dotenv()

STRIPE_SECRET_KEY: str = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET: str = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_CONNECT_WEBHOOK_SECRET: str = os.environ.get("STRIPE_CONNECT_WEBHOOK_SECRET", "")
STRIPE_ACCOUNTS_WEBHOOK_SECRET: str = os.environ.get("STRIPE_ACCOUNTS_WEBHOOK_SECRET", "")

CURRENCY = "aud"

StripeError = stripe.StripeError
CardError = stripe.CardError
SignatureVerificationError = stripe.SignatureVerificationError

_client: Optional[stripe.StripeClient] = None


def client() -> stripe.StripeClient:
    """Built on first use, so importing this module never needs a key (tests,
    seed scripts) and a missing key fails at the first real call instead."""
    global _client
    if _client is None:
        if not STRIPE_SECRET_KEY:
            raise RuntimeError("STRIPE_SECRET_KEY is not set")
        _client = stripe.StripeClient(STRIPE_SECRET_KEY, max_network_retries=2)
    return _client


def _d(obj) -> dict:
    return obj.to_dict() if hasattr(obj, "to_dict") else dict(obj)


def _opts(idempotency_key: Optional[str] = None, account: Optional[str] = None) -> dict:
    opts = {}
    if idempotency_key:
        opts["idempotency_key"] = idempotency_key
    if account:
        opts["stripe_account"] = account
    return opts


# ── Customers + saved cards (platform account) ───────────────────────────────

def create_customer(*, email: Optional[str], name: Optional[str], user_id: str) -> dict:
    params = {"metadata": {"impulseUserId": user_id}}
    if email:
        params["email"] = email
    if name:
        params["name"] = name
    return _d(client().v1.customers.create(params, _opts(f"customer-{user_id}")))


def retrieve_customer(customer_id: str) -> dict:
    return _d(client().v1.customers.retrieve(customer_id))


def delete_customer(customer_id: str) -> None:
    """Deleting a Customer detaches every saved card with it."""
    client().v1.customers.delete(customer_id)


def set_default_payment_method(customer_id: str, payment_method_id: str) -> None:
    client().v1.customers.update(
        customer_id, {"invoice_settings": {"default_payment_method": payment_method_id}},
    )


def list_cards(customer_id: str) -> list:
    page = client().v1.customers.payment_methods.list(customer_id, {"type": "card", "limit": 100})
    return [_d(pm) for pm in page.data]


def detach_payment_method(payment_method_id: str) -> None:
    client().v1.payment_methods.detach(payment_method_id)


def create_customer_session(customer_id: str) -> dict:
    """Lets PaymentSheet show, save and remove the customer's cards without the
    app ever holding a secret key."""
    return _d(client().v1.customer_sessions.create({
        "customer": customer_id,
        "components": {"mobile_payment_element": {
            "enabled": True,
            "features": {
                "payment_method_save": "enabled",
                "payment_method_redisplay": "enabled",
                "payment_method_remove": "enabled",
            },
        }},
    }))


# ── Holds and captures ───────────────────────────────────────────────────────

def create_payment_intent(params: dict, idempotency_key: str) -> dict:
    return _d(client().v1.payment_intents.create(params, _opts(idempotency_key)))


def retrieve_payment_intent(intent_id: str) -> dict:
    return _d(client().v1.payment_intents.retrieve(
        intent_id, {"expand": ["latest_charge", "payment_method"]},
    ))


def capture_payment_intent(intent_id: str, params: dict, idempotency_key: str) -> dict:
    return _d(client().v1.payment_intents.capture(intent_id, params, _opts(idempotency_key)))


def cancel_payment_intent(intent_id: str, idempotency_key: str) -> dict:
    return _d(client().v1.payment_intents.cancel(intent_id, None, _opts(idempotency_key)))


def create_setup_intent(params: dict, idempotency_key: str) -> dict:
    return _d(client().v1.setup_intents.create(params, _opts(idempotency_key)))


def retrieve_setup_intent(intent_id: str) -> dict:
    return _d(client().v1.setup_intents.retrieve(intent_id, {"expand": ["payment_method"]}))


def create_refund(params: dict, idempotency_key: str) -> dict:
    return _d(client().v1.refunds.create(params, _opts(idempotency_key)))


# ── Connected accounts (venues, Accounts v2) ─────────────────────────────────

ACCOUNT_INCLUDE = ["configuration.recipient", "identity", "requirements"]


def create_connected_account(params: dict, idempotency_key: str) -> dict:
    return _d(client().v2.core.accounts.create(
        {**params, "include": ACCOUNT_INCLUDE}, _opts(idempotency_key),
    ))


def retrieve_account(account_id: str) -> dict:
    return _d(client().v2.core.accounts.retrieve(account_id, {"include": ACCOUNT_INCLUDE}))


def create_account_session(account_id: str, components: dict) -> dict:
    return _d(client().v1.account_sessions.create({"account": account_id, "components": components}))


def retrieve_balance(account_id: str) -> dict:
    return _d(client().v1.balance.retrieve(
        {"expand": ["instant_available.net_available"]}, _opts(account=account_id),
    ))


def create_payout(account_id: str, params: dict, idempotency_key: str) -> dict:
    return _d(client().v1.payouts.create(params, _opts(idempotency_key, account_id)))


def list_payouts(account_id: str, limit: int = 50) -> list:
    page = client().v1.payouts.list({"limit": limit}, _opts(account=account_id))
    return [_d(p) for p in page.data]


# ── Webhooks ─────────────────────────────────────────────────────────────────

def construct_event(payload: bytes, signature: str, secret: str) -> dict:
    """A snapshot (v1) event. Raises SignatureVerificationError or ValueError."""
    return _d(client().construct_event(payload, signature, secret))


def parse_thin_event(payload: bytes, signature: str, secret: str):
    """A thin (v2) event notification — Accounts v2 status changes arrive this
    way. It carries only the related object's id; callers re-fetch."""
    return client().parse_event_notification(payload, signature, secret)
