"""Stripe Connect onboarding for venues, and the Stripe webhooks. Stripe and the
database are stubbed — these cover the decisions Impulse makes (what account
we create, who we let through, when a venue may publish, what a webhook
changes), not Stripe's own behaviour."""
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import stripe_client
from auth import get_current_user
from database import get_db
from models import Booking, User, Venue
from routers import merchants, webhooks

OWNER = "11111111-1111-1111-1111-111111111111"
STRANGER = "22222222-2222-2222-2222-222222222222"
VENUE_ID = "33333333-3333-3333-3333-333333333333"


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._rows[0] if self._rows else None


class FakeSession:
    def __init__(self, venue, owner=None, bookings=()):
        self.venue, self.owner, self.bookings = venue, owner, list(bookings)
        self.commits = 0

    def query(self, model):
        rows = {Venue: [self.venue] if self.venue else [], User: [self.owner] if self.owner else [],
                Booking: self.bookings}.get(model, [])
        return FakeQuery(rows)

    def commit(self):
        self.commits += 1

    def rollback(self):
        pass

    def refresh(self, obj):
        pass

    def close(self):
        pass


def _venue(**overrides):
    venue = Venue(id=VENUE_ID, owner_id=OWNER, name="The Lantern Room", category="bar",
                  email="hello@lanternroom.example")
    venue.stripe_account_id = None
    venue.stripe_transfers_status = None
    venue.stripe_requirements = None
    venue.pilot_ends_at = None
    for key, value in overrides.items():
        setattr(venue, key, value)
    return venue


def _account(status="pending", entries=()):
    return {"id": "acct_123", "configuration": {"recipient": {"capabilities": {
        "stripe_balance": {"stripe_transfers": {"status": status}}}}},
        "requirements": {"entries": list(entries)}}


@pytest.fixture
def venue():
    return _venue()


def _client(venue, user_id=OWNER):
    session = FakeSession(venue)
    app = FastAPI()
    app.include_router(merchants.router, prefix="/merchants")
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: {"sub": user_id, "email": "owner@example.com"}
    return TestClient(app), session


# ── Creating the connected account ────────────────────────────────────────────

def test_create_makes_a_v2_marketplace_recipient_account(venue, monkeypatch):
    sent = {}
    monkeypatch.setattr(stripe_client, "create_connected_account",
                        lambda params, idempotency_key: sent.update(params, key=idempotency_key) or _account())
    client, _ = _client(venue)
    r = client.post(f"/merchants/venues/{VENUE_ID}")
    assert r.status_code == 201, r.text
    assert sent["dashboard"] == "express"
    assert sent["defaults"]["responsibilities"] == {"fees_collector": "application", "losses_collector": "application"}
    assert sent["configuration"] == {"recipient": {"capabilities": {
        "stripe_balance": {"stripe_transfers": {"requested": True}}}}}
    assert "merchant" not in sent["configuration"] and "type" not in sent    # no legacy v1 account types
    assert sent["identity"] == {"country": "au"} and sent["key"] == f"account-{VENUE_ID}"
    assert venue.stripe_account_id == "acct_123" and venue.stripe_transfers_status == "pending"


def test_create_starts_a_three_month_pilot_unless_one_is_set(venue, monkeypatch):
    monkeypatch.setattr(stripe_client, "create_connected_account", lambda params, idempotency_key: _account())
    client, _ = _client(venue)
    before = datetime.now(timezone.utc)
    body = client.post(f"/merchants/venues/{VENUE_ID}").json()
    assert body["in_pilot"] is True
    assert 89 <= (venue.pilot_ends_at - before).days <= 92

    preset = datetime(2027, 1, 1, tzinfo=timezone.utc)
    other = _venue(pilot_ends_at=preset)
    client, _ = _client(other)
    client.post(f"/merchants/venues/{VENUE_ID}")
    assert other.pilot_ends_at == preset


def test_create_is_idempotent(venue, monkeypatch):
    venue.stripe_account_id = "acct_existing"
    calls = []
    monkeypatch.setattr(stripe_client, "create_connected_account", lambda *a, **k: calls.append(1))
    client, _ = _client(venue)
    assert client.post(f"/merchants/venues/{VENUE_ID}").json()["stripe_account_id"] == "acct_existing"
    assert calls == []


def test_a_failed_create_leaves_no_account_behind(venue, monkeypatch):
    def boom(*a, **k):
        raise stripe_client.StripeError("nope")
    monkeypatch.setattr(stripe_client, "create_connected_account", boom)
    client, _ = _client(venue)
    assert client.post(f"/merchants/venues/{VENUE_ID}").status_code == 502
    assert venue.stripe_account_id is None


def test_routes_refuse_a_venue_you_do_not_own(venue, monkeypatch):
    monkeypatch.setattr(stripe_client, "create_connected_account", lambda *a, **k: pytest.fail("created"))
    client, _ = _client(venue, user_id=STRANGER)
    assert client.post(f"/merchants/venues/{VENUE_ID}").status_code == 403
    assert client.post(f"/merchants/venues/{VENUE_ID}/account-session").status_code == 403
    assert client.get(f"/merchants/venues/{VENUE_ID}/status").status_code == 403


def test_account_session_enables_onboarding_and_the_notification_banner(venue, monkeypatch):
    venue.stripe_account_id = "acct_123"
    sent = {}
    monkeypatch.setattr(stripe_client, "create_account_session",
                        lambda acct, components: sent.update(components, acct=acct) or {"client_secret": "accs_1"})
    client, _ = _client(venue)
    assert client.post(f"/merchants/venues/{VENUE_ID}/account-session").json() == {"client_secret": "accs_1"}
    assert sent["acct"] == "acct_123"
    assert sent["account_onboarding"]["enabled"] and sent["notification_banner"]["enabled"]
    assert sent["payouts"]["features"]["instant_payouts"] is True


def test_account_session_needs_an_account_first(venue):
    client, _ = _client(venue)
    assert client.post(f"/merchants/venues/{VENUE_ID}/account-session").status_code == 409


# ── Status + publishing ───────────────────────────────────────────────────────

def test_status_refreshes_from_stripe_and_lists_whats_due(venue, monkeypatch):
    venue.stripe_account_id = "acct_123"
    # The shape a real sandbox account returned: the field path is the description.
    routine = [{"code": "routine_onboarding"}]
    monkeypatch.setattr(stripe_client, "retrieve_account", lambda acct: _account("restricted", [
        {"description": "defaults.profile.business_url", "minimum_deadline": {"status": "past_due"},
         "errors": [], "requested_reasons": routine},
        {"description": "identity.attestations.terms_of_service.account.date",
         "minimum_deadline": {"status": "past_due"}, "errors": [], "requested_reasons": routine},
        {"description": "identity.attestations.terms_of_service.account.ip",
         "minimum_deadline": {"status": "past_due"}, "errors": [], "requested_reasons": routine},
        {"description": "identity.business_details.address.city", "minimum_deadline": {"status": "eventually_due"}},
    ]))
    client, _ = _client(venue)
    body = client.get(f"/merchants/venues/{VENUE_ID}/status").json()
    assert body["transfers_status"] == "restricted" and body["can_publish_deals"] is False
    assert body["outstanding"] == ["Your website (a social media page is fine)", "Accept Stripe's terms"]
    assert body["needs_attention"] is False          # just unfinished onboarding


def test_a_rejected_detail_needs_attention(venue, monkeypatch):
    venue.stripe_account_id = "acct_123"
    monkeypatch.setattr(stripe_client, "retrieve_account", lambda acct: _account("restricted", [
        {"description": "identity.business_details.id_numbers", "minimum_deadline": {"status": "past_due"},
         "errors": [{"code": "invalid_value"}], "requested_reasons": [{"code": "routine_onboarding"}]},
    ]))
    client, _ = _client(venue)
    body = client.get(f"/merchants/venues/{VENUE_ID}/status").json()
    assert body["outstanding"] == ["Your ABN"] and body["needs_attention"] is True


def test_only_an_active_account_can_publish():
    assert not merchants.can_publish_deals(_venue())
    assert not merchants.can_publish_deals(_venue(stripe_account_id="acct_1", stripe_transfers_status="pending"))
    assert merchants.can_publish_deals(_venue(stripe_account_id="acct_1", stripe_transfers_status="active"))


def test_add_months_clamps_to_month_end():
    assert merchants.add_months(datetime(2026, 11, 30, tzinfo=timezone.utc), 3) == datetime(2027, 2, 28, tzinfo=timezone.utc)


# ── Webhooks ──────────────────────────────────────────────────────────────────

def _webhook_app():
    app = FastAPI()
    app.include_router(webhooks.router, prefix="/webhooks")
    return TestClient(app)


def test_platform_webhook_rejects_a_bad_signature(monkeypatch):
    monkeypatch.setattr(stripe_client, "STRIPE_WEBHOOK_SECRET", "whsec_test")

    def bad(payload, sig, secret):
        raise stripe_client.SignatureVerificationError("bad", sig)
    monkeypatch.setattr(stripe_client, "construct_event", bad)
    r = _webhook_app().post("/webhooks/stripe", content=b"{}", headers={"stripe-signature": "t=1,v1=x"})
    assert r.status_code == 400


def test_capturable_hold_webhook_finalises_the_seat(monkeypatch):
    monkeypatch.setattr(stripe_client, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(stripe_client, "construct_event", lambda p, s, k: {
        "type": "payment_intent.amount_capturable_updated", "data": {"object": {"id": "pi_9"}}})
    seen = []
    monkeypatch.setattr(webhooks.flow, "confirm_hold_from_webhook", lambda db, intent_id: seen.append(intent_id))
    monkeypatch.setattr(webhooks, "SessionLocal", lambda: FakeSession(None))
    r = _webhook_app().post("/webhooks/stripe", content=b"{}", headers={"stripe-signature": "x"})
    assert r.status_code == 200 and seen == ["pi_9"]


def test_payout_paid_webhook_marks_the_booking(monkeypatch):
    monkeypatch.setattr(stripe_client, "STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_c")
    monkeypatch.setattr(stripe_client, "construct_event", lambda p, s, k: {
        "type": "payout.paid", "account": "acct_123", "data": {"object": {"id": "po_1", "amount": 4000}}})
    booking = Booking(id="b-1", stripe_payout_id="po_1", payout_status="pending")
    monkeypatch.setattr(webhooks, "SessionLocal", lambda: FakeSession(None, bookings=[booking]))
    assert _webhook_app().post("/webhooks/stripe/connect", content=b"{}", headers={"stripe-signature": "x"}).status_code == 200
    assert booking.payout_status == "paid"


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(webhooks, "is_configured", lambda: True)
    monkeypatch.setattr(webhooks, "send_email", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


def test_becoming_active_emails_the_owner_once(outbox):
    owner = User(id=OWNER, email="owner@example.com")
    v = _venue(stripe_account_id="acct_123", stripe_transfers_status="active")
    session = FakeSession(v, owner)
    webhooks._notify_status_change(session, v, previous="pending")
    webhooks._notify_status_change(session, v, previous="active")
    assert len(outbox) == 1 and "verified" in outbox[0][1] and outbox[0][0] == ["owner@example.com"]


def test_restriction_email_lists_what_stripe_needs(outbox):
    v = _venue(stripe_account_id="acct_123", stripe_transfers_status="restricted",
               stripe_requirements=[{"description": "Upload a bank statement"}])
    webhooks._notify_status_change(FakeSession(v, User(id=OWNER, email="o@example.com")), v, previous="active")
    assert "Upload a bank statement" in outbox[0][2]
