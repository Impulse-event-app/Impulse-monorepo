"""Payment-due pushes go out time-sensitive (iOS) and high priority (Android);
everything else stays a normal push. Token lookup and sending are stubbed."""
from types import SimpleNamespace

import pytest

import booking_flow as flow
import push


def _booking():
    host = SimpleNamespace(id="m1", user_id="u1", display_name="Rahul", seat_label=None,
                           covered_by_member_id=None, share_amount_cents=4800)
    sam = SimpleNamespace(id="m2", user_id="u2", display_name="Sam", seat_label=None,
                          covered_by_member_id=None, share_amount_cents=4800)
    deal = SimpleNamespace(date="Friday 23 October 2026", venue=SimpleNamespace(name="Kingpin Lanes"))
    return SimpleNamespace(id="b1", has_voting=False, initiator_member_id="m1", participants=[host, sam],
                           deal=deal, slot_time="7:00 PM"), sam


@pytest.fixture
def sent(monkeypatch):
    box = []
    monkeypatch.setattr(flow, "member_push_tokens",
                        lambda db, ps: {p.user_id: f"ExponentPushToken[{p.user_id}]" for p in ps})
    monkeypatch.setattr(push, "send_push_many", lambda msgs: box.extend(msgs))
    return box


def test_seat_invite_is_time_sensitive(sent):
    b, sam = _booking()
    flow.push_invite(None, b, sam)
    assert sent[0]["interruptionLevel"] == "time-sensitive"
    assert sent[0]["priority"] == "high"
    assert sent[0]["categoryId"] == "seat_invite"


def test_share_confirmed_is_time_sensitive(sent):
    b, _ = _booking()
    flow.push_shares(None, b)
    assert [m["to"] for m in sent] == ["ExponentPushToken[u2]"]   # not the host
    assert sent[0]["interruptionLevel"] == "time-sensitive"


def test_declined_stays_a_normal_push(sent):
    b, _ = _booking()
    flow.push_declined(None, b, "Sam")
    assert "interruptionLevel" not in sent[0]
