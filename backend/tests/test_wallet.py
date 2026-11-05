"""Saved cards on the user's Stripe Customer. Stripe is stubbed — these cover
the decisions Impulse makes (one Customer per user, how a card is shown),
not Stripe's own behaviour."""
from types import SimpleNamespace

import stripe_client
import wallet


def _pm(pm_id, created, last4="4242", brand="visa", wallet_type=None):
    return {"id": pm_id, "created": created, "billing_details": {"name": "Sam Ng"},
            "card": {"brand": brand, "last4": last4, "exp_month": 3, "exp_year": 2029,
                     "funding": "credit", "wallet": {"type": wallet_type} if wallet_type else None}}


def test_customer_is_created_once_and_reused(monkeypatch):
    made = []
    monkeypatch.setattr(stripe_client, "create_customer",
                        lambda **kw: made.append(kw) or {"id": "cus_1"})
    row = SimpleNamespace(id="u-1", email="sam@example.com", full_name="Sam Ng", stripe_customer_id=None)
    assert wallet.ensure_customer(row) == "cus_1"
    assert wallet.ensure_customer(row) == "cus_1"
    assert len(made) == 1 and made[0]["user_id"] == "u-1"


def test_card_view_matches_what_the_app_renders():
    view = wallet.card_view(_pm("pm_1", 1, wallet_type="apple_pay"), default_id="pm_1")
    assert view == {"id": "pm_1", "card_scheme": "visa", "display_card_number": "4242",
                    "expiry_date": "03/29", "card_holder_name": "Sam Ng", "funding": "credit",
                    "is_default": True, "wallet": "apple_pay"}


def test_list_puts_the_default_first_then_newest(monkeypatch):
    monkeypatch.setattr(stripe_client, "retrieve_customer",
                        lambda cid: {"invoice_settings": {"default_payment_method": "pm_old"}})
    monkeypatch.setattr(stripe_client, "list_cards",
                        lambda cid: [_pm("pm_mid", 2), _pm("pm_old", 1), _pm("pm_new", 3)])
    row = SimpleNamespace(id="u-1", stripe_customer_id="cus_1")
    assert [c["id"] for c in wallet.list_cards(row)] == ["pm_old", "pm_new", "pm_mid"]


def test_newest_card_is_default_when_none_is_set(monkeypatch):
    monkeypatch.setattr(stripe_client, "retrieve_customer", lambda cid: {"invoice_settings": {}})
    monkeypatch.setattr(stripe_client, "list_cards", lambda cid: [_pm("pm_a", 1), _pm("pm_b", 2)])
    cards = wallet.list_cards(SimpleNamespace(id="u-1", stripe_customer_id="cus_1"))
    assert cards[0]["id"] == "pm_b" and cards[0]["is_default"]


def test_no_customer_means_no_cards():
    assert wallet.list_cards(SimpleNamespace(id="u-1", stripe_customer_id=None)) == []
    assert wallet.list_cards(None) == []
