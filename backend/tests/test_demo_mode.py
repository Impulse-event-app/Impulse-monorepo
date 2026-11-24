"""Demo venues are visible to demo accounts only."""
from types import SimpleNamespace

import demo_mode
from routers.merchants import can_publish_deals


class FakeQuery:
    def __init__(self, scalar=None):
        self.filters = []
        self._scalar = scalar

    def filter(self, *conds):
        self.filters.extend(str(c) for c in conds)
        return self

    def scalar(self):
        return self._scalar


class FakeDB:
    def __init__(self, is_demo):
        self.is_demo = is_demo

    def query(self, *_):
        return FakeQuery(self.is_demo)


def test_signed_out_viewers_never_see_demo_venues():
    q = demo_mode.hide_demo_venues(FakeQuery(), FakeDB(True), None)
    assert any("is_demo" in f for f in q.filters)


def test_regular_accounts_never_see_demo_venues():
    q = demo_mode.hide_demo_venues(FakeQuery(), FakeDB(False), {"sub": "u1"})
    assert any("is_demo" in f for f in q.filters)


def test_demo_accounts_see_everything():
    q = demo_mode.hide_demo_venues(FakeQuery(), FakeDB(True), {"sub": "reviewer"})
    assert q.filters == []


def test_demo_venue_publishes_without_stripe_but_a_real_one_cannot():
    assert can_publish_deals(SimpleNamespace(is_demo=True, stripe_account_id=None, stripe_transfers_status=None))
    assert not can_publish_deals(SimpleNamespace(is_demo=False, stripe_account_id=None, stripe_transfers_status=None))
