"""Discover feed (GET /reels): which reels show, in what order, and which
deal each one's Book button points at.

The pure helpers run everywhere. The endpoint tests need a disposable
database, like test_booking_api.py:

    createdb impulse_test
    IMPULSE_TEST_DATABASE_URL=postgresql+psycopg://localhost/impulse_test uv run pytest tests/test_reels.py
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from routers.reels import newest_live_deal_by_venue
from schemas import ReelResponse

TEST_DB = os.environ.get("IMPULSE_TEST_DATABASE_URL")
T0 = datetime(2026, 10, 17, 9, 0, tzinfo=timezone.utc)


def _deal(venue_id, *, minutes=0, active=True, spots=5, **kw):
    return SimpleNamespace(
        id=str(uuid.uuid4()), venue_id=venue_id, is_active=active, spots_remaining=spots,
        created_at=T0 + timedelta(minutes=minutes), title="Lane for 4", deal_price=40,
        original_price=80, unit="/lane", **kw,
    )


# ── Picking the deal ──────────────────────────────────────────────────────────

def test_newest_live_deal_wins():
    old, new = _deal("v1", minutes=0), _deal("v1", minutes=5)
    assert newest_live_deal_by_venue([old, new])["v1"] is new
    assert newest_live_deal_by_venue([new, old])["v1"] is new


def test_inactive_and_sold_out_deals_are_skipped():
    live = _deal("v1", minutes=0)
    assert newest_live_deal_by_venue([live, _deal("v1", minutes=5, active=False)])["v1"] is live
    assert newest_live_deal_by_venue([live, _deal("v1", minutes=5, spots=0)])["v1"] is live


def test_venue_with_no_live_deal_is_absent():
    assert newest_live_deal_by_venue([_deal("v1", active=False)]) == {}


def test_each_venue_gets_its_own_deal():
    a, b = _deal("v1"), _deal("v2")
    assert newest_live_deal_by_venue([a, b]) == {"v1": a, "v2": b}


# ── Building the response ─────────────────────────────────────────────────────

def _reel():
    venue = SimpleNamespace(name="Kingpin Lanes", category="Bowling", suburb="Surry Hills", image_url=None)
    return SimpleNamespace(
        id="r1", venue_id="v1", venue=venue, video_url="https://x/r1.mp4", poster_url=None, caption="Strike!",
    )


def test_reel_with_deal_carries_its_fields():
    d = _deal("v1")
    out = ReelResponse.from_reel(_reel(), d)
    assert (out.deal_id, out.deal_title, out.deal_price, out.original_price, out.unit) == (
        d.id, "Lane for 4", 40.0, 80.0, "/lane")
    assert out.venue_name == "Kingpin Lanes"


def test_reel_without_deal_has_no_book_target():
    out = ReelResponse.from_reel(_reel(), None)
    assert out.deal_id is None and out.deal_price is None


# ── The endpoint, against a real database ─────────────────────────────────────

@pytest.fixture(scope="module")
def api():
    if not TEST_DB:
        pytest.skip("IMPULSE_TEST_DATABASE_URL not set")
    live = os.environ.get("DATABASE_URL", "")
    if "supabase" in TEST_DB or TEST_DB == live:
        pytest.fail("IMPULSE_TEST_DATABASE_URL must be a disposable local database, not Supabase")

    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    import main
    from database import Base, get_db
    from models import Deal, User, Venue, VenueReel

    engine = create_engine(TEST_DB)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = _db
    owner = str(uuid.uuid4())
    with Session() as db:
        db.add(User(id=owner, email="owner@example.test"))
        lanes = Venue(owner_id=owner, name="Test Lanes", category="Bowling")
        bar = Venue(owner_id=owner, name="Test Bar", category="Bar")
        closed = Venue(owner_id=owner, name="Closed Venue", category="Bar", is_active=False)
        db.add_all([lanes, bar, closed])
        db.flush()
        db.add(Deal(
            venue_id=lanes.id, title="Lane for 4", category="Bowling", original_price=80, discount_pct=50,
            deal_price=40, date="Friday 23 October 2026", slots=["7:00 PM"], total_spots=5, spots_remaining=5,
        ))
        db.add_all([
            VenueReel(venue_id=bar.id, video_url="https://x/bar.mp4", sort_order=1),
            VenueReel(venue_id=lanes.id, video_url="https://x/lanes.mp4", sort_order=0),
            VenueReel(venue_id=lanes.id, video_url="https://x/hidden.mp4", is_active=False),
            VenueReel(venue_id=closed.id, video_url="https://x/closed.mp4"),
        ])
        db.commit()

    yield TestClient(main.app)
    main.app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_feed_lists_active_reels_in_order(api):
    reels = api.get("/reels").json()
    assert [r["video_url"] for r in reels] == ["https://x/lanes.mp4", "https://x/bar.mp4"]


def test_feed_attaches_live_deal_only_where_there_is_one(api):
    lanes, bar = api.get("/reels").json()
    assert lanes["deal_title"] == "Lane for 4" and lanes["deal_price"] == 40.0
    assert bar["deal_id"] is None
