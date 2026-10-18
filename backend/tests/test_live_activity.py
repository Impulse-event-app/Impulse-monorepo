"""Live Activity content, APNs payloads and the touch → after-commit hook.
No database and no network: bookings are stand-ins, APNs is stubbed."""
import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from jose import jwt
from sqlalchemy.orm import Session

import apns
import booking_flow as flow
import live_activity
from models import Booking

DEADLINE = datetime(2026, 10, 23, 7, 0, tzinfo=timezone.utc)


def _seat(id, user_id, status="unpaid", share=4800, covered_by=None, joined=1):
    return SimpleNamespace(id=id, user_id=user_id, deposit_status=status, share_amount_cents=share,
                           covered_by_member_id=covered_by,
                           joined_at=datetime(2026, 10, 18, 9, joined, tzinfo=timezone.utc))


def _booking(status="collecting", seats=None, code=None):
    seats = seats or [_seat("m1", "u1", "paid"), _seat("m2", "u2", joined=2)]
    deal = SimpleNamespace(date="Friday 23 October 2026", venue=SimpleNamespace(name="Kingpin Lanes"))
    return SimpleNamespace(id="b1", status=status, participants=seats, initiator_member_id="m1",
                           deal=deal, slot_time="7:00 PM", share_deadline=DEADLINE,
                           confirmation_code=code)


# ── content ──────────────────────────────────────────────────────────────────

def test_collecting_props_for_someone_still_to_pay():
    b = _booking()
    props = live_activity.content_props(b, b.participants[1])
    assert props["phase"] == "collecting"
    assert (props["paid"], props["total"]) == (1, 2)
    assert props["venue"] == "Kingpin Lanes" and props["slot"] == "Fri 7:00 PM"
    assert props["deadlineAt"] == int(DEADLINE.timestamp() * 1000)
    assert props["slotAt"] > props["deadlineAt"]          # 7pm Sydney is after the deadline
    assert props["myShareCents"] == 4800 and props["iPaid"] is False


def test_covered_seat_owes_nothing():
    b = _booking(seats=[_seat("m1", "u1", "paid"), _seat("m2", "u2", covered_by="m1", joined=2)])
    props = live_activity.content_props(b, b.participants[1])
    assert props["myShareCents"] == 0 and props["iPaid"] is True


def test_confirmed_ends_the_card_with_the_code():
    b = _booking("confirmed", [_seat("m1", "u1", "paid"), _seat("m2", "u2", "paid", joined=2)], code="123456")
    host = b.participants[0]
    props = live_activity.content_props(b, host)
    assert props["phase"] == "ended" and "123456" in props["note"]
    assert props["paid"] == props["total"] == 2
    assert live_activity.view_props(b, host) == props                    # so the app can end it too
    assert live_activity.payload(b, host)["aps"]["event"] == "end"


def test_finished_booking_ends_with_a_note():
    b = _booking("collapsed")
    props = live_activity.content_props(b, b.participants[1])
    assert props["phase"] == "ended" and "refunded" in props["note"]


def test_view_props_only_for_the_person_who_booked():
    b = _booking()
    assert live_activity.view_props(b, b.participants[0]) is not None
    assert live_activity.view_props(b, b.participants[1]) is None       # invitees get pushes instead
    assert live_activity.view_props(b, None) is None
    assert live_activity.view_props(_booking("redeemed"), b.participants[0]) is None
    solo = _booking(seats=[_seat("m1", "u1", "paid")])
    assert live_activity.view_props(solo, solo.participants[0]) is None


# ── APNs payload ─────────────────────────────────────────────────────────────

def test_update_payload_shape():
    b = _booking()
    msg = live_activity.payload(b, b.participants[1], now=1_000)
    aps = msg["aps"]
    assert aps["event"] == "update" and aps["timestamp"] == 1_000
    assert aps["content-state"]["name"] == "booking"
    assert json.loads(aps["content-state"]["props"])["paid"] == 1     # props travel as a JSON string
    assert "dismissal-date" not in aps
    assert live_activity.priority(b) == 5


def test_end_payload_dismisses_later():
    b = _booking("cancelled")
    aps = live_activity.payload(b, b.participants[1], now=1_000)["aps"]
    assert aps["event"] == "end"
    assert aps["dismissal-date"] == 1_000 + live_activity.DISMISS_AFTER
    assert live_activity.priority(b) == 10


@pytest.fixture
def apns_env(monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    monkeypatch.setenv("APNS_KEY_ID", "KEY1234567")
    monkeypatch.setenv("APNS_TEAM_ID", "TEAM123456")
    monkeypatch.setenv("APNS_KEY", pem.replace("\n", "\\n"))    # as pasted into Render
    monkeypatch.setenv("APNS_BUNDLE_ID", "au.impulseapp.impulse")
    monkeypatch.setattr(apns, "_jwt", None)
    return key


def test_headers_and_cached_jwt(apns_env):
    h = apns.headers(10)
    assert h["apns-push-type"] == "liveactivity"
    assert h["apns-topic"] == "au.impulseapp.impulse.push-type.liveactivity"
    assert h["apns-priority"] == "10"
    token = h["authorization"].removeprefix("bearer ")
    assert jwt.get_unverified_header(token) == {"alg": "ES256", "kid": "KEY1234567", "typ": "JWT"}
    assert jwt.get_unverified_claims(token)["iss"] == "TEAM123456"
    assert apns.auth_token() == token          # reused, not re-minted


def test_not_configured_sends_nothing(monkeypatch):
    monkeypatch.delenv("APNS_KEY", raising=False)
    monkeypatch.setattr(apns, "_post", lambda *a: pytest.fail("should not send"))
    assert apns.send_live_activity("ab" * 32, "production", {}) == (apns.FAILED, "production")


def test_development_token_retries_on_sandbox(apns_env, monkeypatch):
    calls = []

    def fake_post(env, token, payload, priority):
        calls.append(env)
        return (400, "BadDeviceToken") if env == "production" else (200, "")
    monkeypatch.setattr(apns, "_post", fake_post)
    assert apns.send_live_activity("ab" * 32, "production", {}) == (apns.OK, "sandbox")
    assert calls == ["production", "sandbox"]


def test_unregistered_token_is_dead(apns_env, monkeypatch):
    monkeypatch.setattr(apns, "_post", lambda *a: (410, "Unregistered"))
    assert apns.send_live_activity("ab" * 32, "sandbox", {})[0] == apns.DEAD


# ── sync ─────────────────────────────────────────────────────────────────────

class FakeDB:
    def __init__(self, tokens):
        self.tokens, self.deleted, self.commits = tokens, [], 0

    def query(self, _model):
        return self

    def filter(self, *_):
        return self

    def all(self):
        return list(self.tokens)

    def delete(self, row):
        self.deleted.append(row)

    def commit(self):
        self.commits += 1


def _token(member_id, tok, env="production"):
    return SimpleNamespace(member_id=member_id, push_token=tok, environment=env)


def test_sync_updates_the_hosts_card_only(monkeypatch):
    b = _booking()
    monkeypatch.setattr(flow, "load", lambda db, id: b)
    sent = []
    monkeypatch.setattr(apns, "send_live_activity",
                        lambda tok, env, msg, pri: sent.append((tok, msg)) or (apns.OK, "sandbox"))
    host, stray = _token("m1", "aa"), _token("m2", "bb")
    db = FakeDB([host, stray])
    assert live_activity.sync(db, "b1") == 1
    props = json.loads(sent[0][1]["aps"]["content-state"]["props"])
    assert sent[0][0] == "aa" and props["iPaid"] is True and props["paid"] == 1
    assert host.environment == "sandbox"                    # learned from the send
    assert db.deleted == [stray] and db.commits == 1        # an invitee's token is dropped unsent


def test_sync_drops_dead_ended_and_removed(monkeypatch):
    b = _booking("expired", [_seat("m1", "u1", "paid"), _seat("m2", None, joined=2)])
    monkeypatch.setattr(flow, "load", lambda db, id: b)
    monkeypatch.setattr(apns, "send_live_activity", lambda *a: (apns.OK, "production"))
    gone, ended = _token("m2", "bb"), _token("m1", "aa")
    db = FakeDB([ended, gone])
    live_activity.sync(db, "b1")
    assert db.deleted == [ended, gone]       # final "end" sent, then dropped; empty seat dropped unsent


# ── touch → after commit ─────────────────────────────────────────────────────

def test_touch_queues_each_booking_once_after_commit(monkeypatch):
    queued = []
    monkeypatch.setattr(live_activity, "enqueue", lambda ids: queued.append(set(ids)))
    s = Session()
    b = Booking(id="b1")
    s.add(b)
    flow.touch(b)
    flow.touch(b)
    flow._push_touched(s)
    assert queued == [{"b1"}]
    flow._push_touched(s)                    # a later commit with no change pushes nothing
    assert queued == [{"b1"}]


def test_rollback_forgets_touched(monkeypatch):
    monkeypatch.setattr(live_activity, "enqueue", lambda ids: pytest.fail("rolled back"))
    s = Session()
    b = Booking(id="b1")
    s.add(b)
    flow.touch(b)
    flow._forget_touched(s)
    flow._push_touched(s)


def test_enqueue_is_a_no_op_without_apns(monkeypatch):
    monkeypatch.delenv("APNS_KEY", raising=False)
    monkeypatch.setattr(live_activity._pool, "submit", lambda *a: pytest.fail("queued"))
    live_activity.enqueue(["b1"])
