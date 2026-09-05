"""Venue enquiry endpoint. SMTP is stubbed — these cover the decisions the
endpoint makes around the send, not whether smtplib works."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import mailer
from routers import contact


@pytest.fixture
def client(monkeypatch):
    # Each test gets a clean throttle, or the fifth test inherits the fourth's
    # hits and starts 429ing.
    monkeypatch.setattr(contact, "_recent", {})
    app = FastAPI()
    app.include_router(contact.router, prefix="/api/contact")
    return TestClient(app)


@pytest.fixture
def sent(monkeypatch):
    box = []
    monkeypatch.setattr(
        contact, "send_email",
        lambda to, subject, body, reply_to=None: box.append(
            {"to": to, "subject": subject, "body": body, "reply_to": reply_to}
        ),
    )
    return box


GOOD = {
    "venue": "Strike Bowling Darling Harbour",
    "name": "Sam Reed",
    "email": "sam@strike.example",
    "phone": "0400 000 000",
    "message": "Weekday afternoons are dead for us.",
}


# ── The happy path ────────────────────────────────────────────────────────────

def test_sends_to_both_addresses(client, sent):
    r = client.post("/api/contact/venue", json=GOOD)
    assert r.status_code == 202
    assert len(sent) == 1
    assert sent[0]["to"] == contact.VENUE_ENQUIRY_TO
    assert "rahul@impulseapp.au" in contact.VENUE_ENQUIRY_TO
    assert "manoj@impulseapp.au" in contact.VENUE_ENQUIRY_TO


def test_reply_goes_to_the_venue_not_us(client, sent):
    client.post("/api/contact/venue", json=GOOD)
    assert sent[0]["reply_to"] == "sam@strike.example"


def test_body_carries_every_field(client, sent):
    client.post("/api/contact/venue", json=GOOD)
    body = sent[0]["body"]
    for value in ("Strike Bowling", "Sam Reed", "sam@strike.example",
                  "0400 000 000", "Weekday afternoons"):
        assert value in body


def test_optional_fields_may_be_omitted(client, sent):
    r = client.post("/api/contact/venue", json={
        "venue": "Quiet Bar", "name": "Jo", "email": "jo@quiet.example",
    })
    assert r.status_code == 202
    assert len(sent) == 1


# ── Rejections ────────────────────────────────────────────────────────────────

def test_bad_email_is_rejected_before_sending(client, sent):
    r = client.post("/api/contact/venue", json={**GOOD, "email": "not-an-email"})
    assert r.status_code == 422
    assert sent == []


@pytest.mark.parametrize("missing", ["venue", "name", "email"])
def test_required_fields(client, sent, missing):
    payload = {k: v for k, v in GOOD.items() if k != missing}
    assert client.post("/api/contact/venue", json=payload).status_code == 422
    assert sent == []


def test_honeypot_is_dropped_but_looks_accepted(client, sent):
    # A bot that can tell rejection from acceptance is a bot that can iterate.
    r = client.post("/api/contact/venue", json={**GOOD, "website": "http://spam"})
    assert r.status_code == 202
    assert sent == []


def test_rate_limited_after_the_cap(client, sent, monkeypatch):
    monkeypatch.setattr(contact, "_RATE_LIMIT", 2)
    assert client.post("/api/contact/venue", json=GOOD).status_code == 202
    assert client.post("/api/contact/venue", json=GOOD).status_code == 202
    assert client.post("/api/contact/venue", json=GOOD).status_code == 429
    assert len(sent) == 2


# ── The send failing ──────────────────────────────────────────────────────────
# A 502 is the point: the form tells the venue to email directly rather than
# claiming an enquiry landed that never did.

@pytest.mark.parametrize("boom", [mailer.MailNotConfigured, mailer.MailSendFailed])
def test_send_failure_reports_502(client, monkeypatch, boom):
    def explode(*a, **k):
        raise boom("nope")
    monkeypatch.setattr(contact, "send_email", explode)
    assert client.post("/api/contact/venue", json=GOOD).status_code == 502


def test_send_failure_logs_the_enquiry_so_it_is_recoverable(client, monkeypatch, caplog):
    def explode(*a, **k):
        raise mailer.MailSendFailed("nope")
    monkeypatch.setattr(contact, "send_email", explode)
    with caplog.at_level("ERROR", logger="impulse.contact"):
        client.post("/api/contact/venue", json=GOOD)
    assert "sam@strike.example" in caplog.text
