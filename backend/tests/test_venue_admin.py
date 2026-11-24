"""Venue admins (VENUE_ADMIN_USER_IDS, staging only) manage every venue."""
import importlib

import pytest

import environment
from routers.venues import _my_venues_query


class FakeQuery:
    def __init__(self):
        self.filters = []

    def filter(self, *conds):
        self.filters.extend(str(c) for c in conds)
        return self

    def order_by(self, *_):
        return self


class FakeDB:
    def query(self, *_):
        return FakeQuery()


@pytest.fixture
def admins(monkeypatch):
    monkeypatch.setattr(environment, "VENUE_ADMIN_USER_IDS", frozenset({"admin"}))


def test_owner_manages_own_venue_only(admins):
    assert environment.can_manage_venue("owner", {"sub": "owner"})
    assert not environment.can_manage_venue("someone-else", {"sub": "owner"})


def test_admin_manages_any_venue(admins):
    assert environment.can_manage_venue("someone-else", {"sub": "admin"})


def test_missing_user_id_manages_nothing(admins):
    assert not environment.can_manage_venue(None, {})


def test_admin_lists_every_active_venue(admins):
    admin = _my_venues_query(FakeDB(), {"sub": "admin"}).filters
    owner = _my_venues_query(FakeDB(), {"sub": "owner"}).filters
    assert not any("owner_id" in f for f in admin)
    assert any("is_active" in f for f in admin)
    assert any("owner_id" in f for f in owner)


def test_ignored_in_production(monkeypatch):
    monkeypatch.setenv("VENUE_ADMIN_USER_IDS", "admin")
    monkeypatch.setenv("APP_ENV", "production")
    try:
        assert importlib.reload(environment).VENUE_ADMIN_USER_IDS == frozenset()
        monkeypatch.setenv("APP_ENV", "staging")
        assert importlib.reload(environment).VENUE_ADMIN_USER_IDS == {"admin"}
    finally:
        monkeypatch.undo()
        importlib.reload(environment)
