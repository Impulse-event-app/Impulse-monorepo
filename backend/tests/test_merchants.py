"""Pinch managed merchant onboarding. Pinch and the database are stubbed — these
cover the decisions Impulse makes (what we send, who we let through, what we
record, what we refuse to log), not Pinch's own behaviour.

The Pinch field names asserted here are frozen against a live sandbox probe, not
the docs: the published guide's upload path 404s, and the API reference misspells
legalStreetAddress as "legalSreetAddress", which Pinch accepts and then silently
discards. Both traps are regression-tested below.
"""
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import pinch_client
from auth import get_current_user
from database import get_db
from models import User, Venue
from pinch_client import PinchError
from routers import merchants, webhooks

OWNER = "11111111-1111-1111-1111-111111111111"
STRANGER = "22222222-2222-2222-2222-222222222222"
VENUE_ID = "33333333-3333-3333-3333-333333333333"

PDF = b"%PDF-1.7\nfake but correctly-magicked pdf\n"

DRAFT = {
    "company_name": "The Lantern Room Pty Ltd",
    "company_email": "accounts@lanternroom.example",
    "company_phone": "0290000000",
    "abn": "12345678901",
    "legal_street_address": "1 Lantern Lane",
    "legal_suburb": "Newtown",
    "legal_state": "NSW",
    "legal_postcode": "2042",
    "bank_account_name": "The Lantern Room Pty Ltd",
    "bank_bsb": "062-000",
    "bank_account_number": "98765432",
    "afsl_held": False,
    "austrac_registered": True,
    "contacts": [
        {"first_name": "Dana", "last_name": "Reyes", "email": "dana@lanternroom.example",
         "contact_type": "director", "is_primary_contact": True, "ownership": 60.0,
         "dob": "1980-04-02"},
        {"first_name": "Sam", "last_name": "Ng", "email": "sam@lanternroom.example",
         "contact_type": "shareholder", "is_primary_contact": False, "ownership": 40.0},
    ],
}


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)


class FakeSession:
    """Enough Session for these routes: the venue is handed back for any query on
    Venue, documents accumulate in a list, and commits are counted."""

    def __init__(self, venue, owner=None):
        self.venue = venue
        self.owner = owner
        self.added = []
        self.commits = 0
        self.rollbacks = 0

    def query(self, model):
        if model is Venue:
            return FakeQuery([self.venue] if self.venue else [])
        if model is User:
            return FakeQuery([self.owner] if self.owner else [])
        return FakeQuery([o for o in self.added if isinstance(o, model)])

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def refresh(self, obj):
        # Stand in for what the database fills on flush.
        if getattr(obj, "id", None) is None:
            obj.id = "44444444-4444-4444-4444-444444444444"
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime(2026, 9, 9, tzinfo=timezone.utc)

    def close(self):
        pass


def _venue(**overrides):
    venue = Venue(id=VENUE_ID, owner_id=OWNER, name="The Lantern Room", category="bar")
    venue.onboarding_draft = dict(DRAFT)
    venue.pinch_merchant_id = None
    venue.pinch_contacts = None
    venue.pinch_merchant_status = None
    venue.pinch_webhook_secret = None
    venue.bank_account_last3 = None
    for key, value in overrides.items():
        setattr(venue, key, value)
    return venue


@pytest.fixture
def venue():
    return _venue()


def _client(venue, user_id=OWNER):
    session = FakeSession(venue)
    app = FastAPI()
    app.include_router(merchants.router, prefix="/merchants")
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: {"sub": user_id}
    return TestClient(app), session


# ── Payload construction ──────────────────────────────────────────────────────
# What we send Pinch is the whole integration; every field name here is load-bearing.

def test_payload_maps_abn_to_company_registration_number():
    payload = merchants.build_merchant_payload(dict(DRAFT), "203.0.113.9", "ua/1")
    assert payload["companyRegistrationNumber"] == "12345678901"
    assert "abn" not in payload, "Pinch has no abn field; it would be silently dropped"


def test_payload_uses_correctly_spelled_street_address():
    # The API reference says "legalSreetAddress". Pinch accepts that key and
    # discards the value, so a venue's street address vanishes without an error.
    payload = merchants.build_merchant_payload(dict(DRAFT), "203.0.113.9", "ua/1")
    assert payload["legalStreetAddress"] == "1 Lantern Lane"
    assert "legalSreetAddress" not in payload


def test_payload_strips_non_digits_from_bank_details():
    payload = merchants.build_merchant_payload(dict(DRAFT), "203.0.113.9", "ua/1")
    assert payload["bankAccountRoutingNumber"] == "062000"
    assert payload["bankAccountNumber"] == "98765432"


def test_payload_carries_contacts_with_ownership_and_one_primary():
    payload = merchants.build_merchant_payload(dict(DRAFT), "203.0.113.9", "ua/1")
    assert [c["contactType"] for c in payload["contacts"]] == ["director", "shareholder"]
    assert [c["ownership"] for c in payload["contacts"]] == [60.0, 40.0]
    assert sum(1 for c in payload["contacts"] if c["isPrimaryContact"]) == 1


def test_payload_puts_declarations_in_notes():
    # AFSL and AUSTRAC have no field anywhere in the Pinch API, but their
    # compliance guide asks for both, so a reviewer has to see them somewhere.
    payload = merchants.build_merchant_payload(dict(DRAFT), "203.0.113.9", "ua/1")
    assert "AFSL: no" in payload["notes"]
    assert "AUSTRAC registered: yes" in payload["notes"]


def test_payload_takes_ip_and_user_agent_from_the_request():
    payload = merchants.build_merchant_payload(dict(DRAFT), "203.0.113.9", "ua/1")
    assert payload["ipAddress"] == "203.0.113.9"
    assert payload["userAgent"] == "ua/1"


def test_payload_rejects_a_bad_bsb():
    draft = {**DRAFT, "bank_bsb": "0620"}
    with pytest.raises(HTTPException) as e:
        merchants.build_merchant_payload(draft, "203.0.113.9", "ua/1")
    assert e.value.status_code == 400
    assert "BSB" in e.value.detail


def test_payload_rejects_missing_contacts():
    draft = {**DRAFT, "contacts": []}
    with pytest.raises(HTTPException) as e:
        merchants.build_merchant_payload(draft, "203.0.113.9", "ua/1")
    assert e.value.status_code == 400


# ── Creating the merchant ─────────────────────────────────────────────────────

def _merchant_response():
    return {
        "id": "mch_ABC123",
        "compliance": {"status": "new", "submissionStatus": "in-progress"},
        "contacts": [
            {"id": "con_1", "contactType": "director", "firstName": "Dana",
             "lastName": "Reyes", "ownership": 60.0, "isUbo": True, "isPrimaryContact": True},
            {"id": "con_2", "contactType": "shareholder", "firstName": "Sam",
             "lastName": "Ng", "ownership": 40.0, "isUbo": True, "isPrimaryContact": False},
        ],
    }


def test_create_persists_merchant_id_and_contact_ids(venue, monkeypatch):
    monkeypatch.setattr(pinch_client, "create_managed_merchant", lambda body: _merchant_response())
    monkeypatch.setattr(pinch_client, "create_webhook", lambda body, mid: {"secret": "whsec_xyz"})
    client, _ = _client(venue)

    r = client.post(f"/merchants/venues/{VENUE_ID}")
    assert r.status_code == 201
    assert venue.pinch_merchant_id == "mch_ABC123"
    # The con_XXX ids are the only way to attach an ID document to a person.
    assert [c["contact_id"] for c in venue.pinch_contacts] == ["con_1", "con_2"]
    assert venue.pinch_contacts[0]["is_ubo"] is True


def test_create_registers_a_per_venue_webhook(venue, monkeypatch):
    captured = {}
    monkeypatch.setattr(merchants, "PINCH_WEBHOOK_BASE_URL", "https://api.example.com")
    monkeypatch.setattr(pinch_client, "create_managed_merchant", lambda body: _merchant_response())
    monkeypatch.setattr(
        pinch_client, "create_webhook",
        lambda body, mid: captured.update(body=body, mid=mid) or {"secret": "whsec_xyz"},
    )
    client, _ = _client(venue)
    client.post(f"/merchants/venues/{VENUE_ID}")

    # compliance-updated carries no merchant id, so the venue has to be
    # identifiable from the URL Pinch was told to call.
    assert captured["body"]["uri"] == (
        f"https://api.example.com/webhooks/pinch/compliance/{VENUE_ID}"
    )
    assert captured["body"]["eventTypes"] == ["compliance-updated"]
    assert captured["mid"] == "mch_ABC123"
    assert venue.pinch_webhook_secret == "whsec_xyz"


def test_create_skips_webhook_registration_for_an_unreachable_url(venue, monkeypatch):
    # Onboarding from a dev machine must not burn the merchant's one webhook uri
    # on localhost — Pinch bakes it in at creation and never retries it into being.
    hooks = []
    monkeypatch.setattr(merchants, "PINCH_WEBHOOK_BASE_URL", "")
    monkeypatch.setattr(pinch_client, "create_managed_merchant", lambda body: _merchant_response())
    monkeypatch.setattr(pinch_client, "create_webhook", lambda body, mid: hooks.append(body))
    client, _ = _client(venue)

    r = client.post(f"/merchants/venues/{VENUE_ID}")
    assert r.status_code == 201, "the merchant is still created; only the webhook is skipped"
    assert hooks == []
    assert venue.pinch_webhook_secret is None
    assert venue.pinch_merchant_id == "mch_ABC123"


def test_reachability_guard_accepts_only_public_https():
    assert merchants._is_publicly_reachable("https://impulse-monorepo.onrender.com") is True
    assert merchants._is_publicly_reachable("http://impulse-monorepo.onrender.com") is False
    assert merchants._is_publicly_reachable("https://localhost:8000") is False
    assert merchants._is_publicly_reachable("https://127.0.0.1:8000") is False
    assert merchants._is_publicly_reachable("https://192.168.1.14:8000") is False
    assert merchants._is_publicly_reachable("") is False


def test_create_clears_the_bank_account_number(venue, monkeypatch):
    monkeypatch.setattr(pinch_client, "create_managed_merchant", lambda body: _merchant_response())
    monkeypatch.setattr(pinch_client, "create_webhook", lambda body, mid: {"secret": "whsec_xyz"})
    client, _ = _client(venue)
    client.post(f"/merchants/venues/{VENUE_ID}")

    assert "bank_account_number" not in venue.onboarding_draft


def test_create_surfaces_the_exact_pinch_error_body(venue, monkeypatch):
    body = '{"errors":[{"errorMessage":"Bank account number is invalid"}]}'
    def boom(payload):
        raise PinchError(400, body)
    monkeypatch.setattr(pinch_client, "create_managed_merchant", boom)
    client, _ = _client(venue)

    r = client.post(f"/merchants/venues/{VENUE_ID}")
    assert r.status_code == 502
    assert "Bank account number is invalid" in r.json()["detail"]
    assert venue.pinch_merchant_id is None, "a failed create must not leave a merchant id behind"


def test_create_is_refused_twice(venue, monkeypatch):
    venue.pinch_merchant_id = "mch_EXISTING"
    calls = []
    monkeypatch.setattr(pinch_client, "create_managed_merchant", lambda body: calls.append(body))
    client, _ = _client(venue)

    r = client.post(f"/merchants/venues/{VENUE_ID}")
    assert r.status_code == 409
    assert calls == []


# ── Ownership ─────────────────────────────────────────────────────────────────
# These are identity documents. The UI hides other venues, but this is the check
# that actually matters.

def test_upload_is_refused_for_a_venue_you_do_not_own(venue, monkeypatch):
    venue.pinch_merchant_id = "mch_ABC123"
    uploads = []
    monkeypatch.setattr(pinch_client, "upload_merchant_document",
                        lambda **kw: uploads.append(kw))
    client, _ = _client(venue, user_id=STRANGER)

    r = client.post(
        f"/merchants/venues/{VENUE_ID}/documents",
        data={"document_type": "financial-document"},
        files={"file": ("statement.pdf", PDF, "application/pdf")},
    )
    assert r.status_code == 403
    assert uploads == [], "Pinch must never be called for a venue the user does not own"


def test_draft_is_refused_for_a_venue_you_do_not_own(venue):
    client, _ = _client(venue, user_id=STRANGER)
    assert client.get(f"/merchants/venues/{VENUE_ID}/onboarding").status_code == 403


# ── Upload validation ─────────────────────────────────────────────────────────

def _upload(client, content=PDF, content_type="application/pdf",
            document_type="financial-document", name="statement.pdf"):
    return client.post(
        f"/merchants/venues/{VENUE_ID}/documents",
        data={"document_type": document_type},
        files={"file": (name, content, content_type)},
    )


def test_upload_forwards_the_file_and_records_metadata(venue, monkeypatch):
    venue.pinch_merchant_id = "mch_ABC123"
    captured = {}
    monkeypatch.setattr(
        pinch_client, "upload_merchant_document",
        lambda **kw: captured.update(kw) or {"id": "doc_1", "documentType": kw["document_type"]},
    )
    client, session = _client(venue)

    r = _upload(client)
    assert r.status_code == 201
    assert captured["merchant_id"] == "mch_ABC123"
    assert captured["content"] == PDF
    assert session.added[0].pinch_document_id == "doc_1"
    assert session.added[0].size_bytes == len(PDF)


def test_upload_never_records_the_users_filename(venue, monkeypatch):
    # ID document filenames routinely contain the holder's name and licence number.
    venue.pinch_merchant_id = "mch_ABC123"
    captured = {}
    monkeypatch.setattr(pinch_client, "upload_merchant_document",
                        lambda **kw: captured.update(kw) or {"id": "doc_1"})
    client, session = _client(venue)

    _upload(client, name="dana-reyes-licence-1234567.pdf")
    assert "dana-reyes" not in captured["filename"]
    assert "1234567" not in captured["filename"]
    assert "dana-reyes" not in session.added[0].label


def test_upload_rejects_a_disallowed_content_type(venue, monkeypatch):
    venue.pinch_merchant_id = "mch_ABC123"
    uploads = []
    monkeypatch.setattr(pinch_client, "upload_merchant_document", lambda **kw: uploads.append(kw))
    client, _ = _client(venue)

    r = _upload(client, content=b"<html>not an id</html>", content_type="text/html")
    assert r.status_code == 415
    assert uploads == []


def test_upload_rejects_content_that_contradicts_its_declared_type(venue, monkeypatch):
    # The browser says PDF; the bytes say otherwise. The bytes win.
    venue.pinch_merchant_id = "mch_ABC123"
    uploads = []
    monkeypatch.setattr(pinch_client, "upload_merchant_document", lambda **kw: uploads.append(kw))
    client, _ = _client(venue)

    r = _upload(client, content=b"MZ\x90\x00 this is an executable", content_type="application/pdf")
    assert r.status_code == 415
    assert uploads == []


def test_upload_rejects_a_file_over_twenty_megabytes(venue, monkeypatch):
    venue.pinch_merchant_id = "mch_ABC123"
    uploads = []
    monkeypatch.setattr(pinch_client, "upload_merchant_document", lambda **kw: uploads.append(kw))
    client, _ = _client(venue)

    oversized = b"%PDF-1.7\n" + b"\x00" * (merchants.MAX_DOCUMENT_BYTES + 1)
    r = _upload(client, content=oversized)
    assert r.status_code == 413
    assert uploads == []


def test_upload_is_refused_before_the_merchant_exists(venue, monkeypatch):
    uploads = []
    monkeypatch.setattr(pinch_client, "upload_merchant_document", lambda **kw: uploads.append(kw))
    client, _ = _client(venue)

    # A document can only be attached to a contact, and contacts only exist once
    # the merchant has been created.
    assert _upload(client).status_code == 409
    assert uploads == []


def test_upload_logs_neither_filename_nor_contents(venue, monkeypatch, caplog):
    venue.pinch_merchant_id = "mch_ABC123"
    monkeypatch.setattr(pinch_client, "upload_merchant_document", lambda **kw: {"id": "doc_1"})
    client, _ = _client(venue)

    secret = b"%PDF-1.7\nLICENCE 1234567 DANA REYES 12 SECRET ST\n"
    with caplog.at_level(logging.DEBUG):
        _upload(client, content=secret, name="dana-reyes-licence-1234567.pdf")

    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "dana-reyes" not in logged
    assert "1234567" not in logged
    assert "SECRET ST" not in logged
    assert "doc_1" in logged, "the Pinch document id is safe and worth having"


# ── Draft ─────────────────────────────────────────────────────────────────────

def test_draft_never_reads_the_bank_account_number_back(venue):
    client, _ = _client(venue)
    body = client.get(f"/merchants/venues/{VENUE_ID}/onboarding").json()
    assert body["bank_account_number"] is None
    assert "98765432" not in json.dumps(body)


def test_saving_a_later_step_keeps_the_bank_number_from_an_earlier_one(venue):
    client, _ = _client(venue)
    r = client.put(
        f"/merchants/venues/{VENUE_ID}/onboarding",
        json={"company_name": "The Lantern Room Pty Ltd", "completed_steps": ["business"]},
    )
    assert r.status_code == 200
    assert venue.onboarding_draft["bank_account_number"] == "98765432"
    assert venue.bank_account_last3 == "432"


# ── Publish gating ────────────────────────────────────────────────────────────

def test_a_venue_that_never_onboarded_can_still_publish():
    # Every venue predating this flow. Gating these would break what works today.
    assert merchants.can_publish_deals(_venue(pinch_merchant_id=None)) is True


def test_an_onboarded_venue_cannot_publish_until_active():
    pending = _venue(pinch_merchant_id="mch_ABC123", pinch_merchant_status="pending")
    assert merchants.can_publish_deals(pending) is False
    live = _venue(pinch_merchant_id="mch_ABC123", pinch_merchant_status="active")
    assert merchants.can_publish_deals(live) is True


# ── Compliance webhook ────────────────────────────────────────────────────────

SECRET = "whsec_testsecret"


def _signed(payload: dict, secret: str = SECRET, timestamp: int = None):
    raw = json.dumps(payload).encode()
    timestamp = timestamp if timestamp is not None else int(time.time())
    mac = hmac.new(secret.encode(), f"{timestamp}.".encode() + raw, hashlib.sha256).hexdigest()
    return raw, {"pinch-signature": f"t={timestamp},v2={mac}"}


def _pascal(submission_status, merchant_status, notes=None):
    return {
        "Id": "evt_1", "Type": "compliance-updated",
        "Metadata": {"Status": submission_status, "MerchantStatus": merchant_status},
        "Data": {"ComplianceSubmission": {
            "Id": "cmp_1", "SubmissionStatus": submission_status,
            "MerchantStatus": merchant_status, "Notes": notes,
        }},
    }


def _camel(submission_status, merchant_status):
    return {
        "id": "evt_1", "type": "compliance-updated",
        "metadata": {"status": submission_status, "merchantStatus": merchant_status},
        "data": {"complianceSubmission": {
            "id": "cmp_1", "submissionStatus": submission_status,
            "merchantStatus": merchant_status,
        }},
    }


def _webhook_client(venue, monkeypatch, owner=None):
    session = FakeSession(venue, owner)
    monkeypatch.setattr(webhooks, "SessionLocal", lambda: session)
    app = FastAPI()
    app.include_router(webhooks.router, prefix="/webhooks")
    return TestClient(app)


def test_compliance_transitions_pending_to_in_review_to_approved(monkeypatch):
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch)

    for submission, merchant, expected in [
        ("pending", None, "pending"),
        ("in-review", None, "in-review"),
        ("approved", "active", "approved"),
    ]:
        raw, headers = _signed(_pascal(submission, merchant))
        r = client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)
        assert r.status_code == 200
        assert venue.pinch_submission_status == expected
    assert venue.pinch_merchant_status == "active"


def test_compliance_accepts_camelcase_deliveries(monkeypatch):
    # Pinch sends PascalCase by default and camelCase when asked; both arrive.
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch)

    raw, headers = _signed(_camel("approved", "active"))
    client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)
    assert venue.pinch_submission_status == "approved"
    assert venue.pinch_merchant_status == "active"


def test_compliance_records_rejection_notes(monkeypatch):
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch)

    raw, headers = _signed(_pascal("rejected", None, notes="Licence image is black and white"))
    client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)
    assert venue.pinch_submission_status == "rejected"
    assert venue.pinch_compliance_notes == "Licence image is black and white"


def test_compliance_ignores_an_unsigned_request_but_still_answers_200(monkeypatch):
    # 200 either way: a 401 would tell someone probing the endpoint that they were close.
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch)

    r = client.post(f"/webhooks/pinch/compliance/{VENUE_ID}",
                    content=json.dumps(_pascal("approved", "active")).encode())
    assert r.status_code == 200
    assert venue.pinch_merchant_status is None


def test_compliance_ignores_a_wrongly_signed_request(monkeypatch):
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch)

    raw, headers = _signed(_pascal("approved", "active"), secret="whsec_wrong")
    r = client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)
    assert r.status_code == 200
    assert venue.pinch_merchant_status is None


def test_compliance_ignores_a_replayed_request(monkeypatch):
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch)

    stale = int(time.time()) - 3600
    raw, headers = _signed(_pascal("approved", "active"), timestamp=stale)
    r = client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)
    assert r.status_code == 200
    assert venue.pinch_merchant_status is None


# ── Compliance outcome email ──────────────────────────────────────────────────
# A missed status email is how a disengaged venue quietly stalls, so the send is
# wired to the webhook — but it must never be able to fail the webhook itself.

@pytest.fixture
def outbox(monkeypatch):
    box = []
    monkeypatch.setattr(webhooks, "is_configured", lambda: True)
    monkeypatch.setattr(
        webhooks, "send_email",
        lambda to, subject, body, reply_to=None: box.append(
            {"to": to, "subject": subject, "body": body}
        ),
    )
    return box


def _owner(email="dana@lanternroom.example"):
    return User(id=OWNER, email=email)


def test_approval_emails_the_venue_owner(monkeypatch, outbox):
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch, owner=_owner())

    raw, headers = _signed(_pascal("approved", "active"))
    client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)

    assert len(outbox) == 1
    assert outbox[0]["to"] == ["dana@lanternroom.example"]
    assert "verified" in outbox[0]["subject"]


def test_rejection_email_carries_the_reviewer_notes(monkeypatch, outbox):
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch, owner=_owner())

    raw, headers = _signed(_pascal("rejected", None, notes="Licence image is black and white"))
    client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)

    assert len(outbox) == 1
    assert "Action needed" in outbox[0]["subject"]
    assert "black and white" in outbox[0]["body"]
    assert "payments-setup" in outbox[0]["body"]


def test_intermediate_statuses_do_not_email(monkeypatch, outbox):
    # Pinch emits compliance-updated on every document upload too.
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch, owner=_owner())

    for status in ("pending", "in-review"):
        raw, headers = _signed(_pascal(status, None))
        client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)
    assert outbox == []


def test_a_repeated_approval_does_not_email_twice(monkeypatch, outbox):
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch, owner=_owner())

    for _ in range(3):
        raw, headers = _signed(_pascal("approved", "active"))
        client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)
    assert len(outbox) == 1


def test_a_failing_send_still_applies_the_status(monkeypatch):
    # Pinch retries a non-200, and re-applying an update we already made is worse
    # than losing an email.
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    client = _webhook_client(venue, monkeypatch, owner=_owner())
    monkeypatch.setattr(webhooks, "is_configured", lambda: True)

    def boom(to, subject, body, reply_to=None):
        raise webhooks.MailSendFailed("smtp is down")
    monkeypatch.setattr(webhooks, "send_email", boom)

    raw, headers = _signed(_pascal("approved", "active"))
    r = client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)
    assert r.status_code == 200
    assert venue.pinch_merchant_status == "active"


def test_no_owner_email_is_not_fatal(monkeypatch, outbox):
    venue = _venue(pinch_merchant_id="mch_ABC123", pinch_webhook_secret=SECRET)
    venue.email = None
    client = _webhook_client(venue, monkeypatch, owner=_owner(email=None))

    raw, headers = _signed(_pascal("approved", "active"))
    r = client.post(f"/webhooks/pinch/compliance/{VENUE_ID}", content=raw, headers=headers)
    assert r.status_code == 200
    assert venue.pinch_merchant_status == "active"
    assert outbox == []
