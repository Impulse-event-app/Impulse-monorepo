"""Full-price booking: a venue's standard offer becomes a 0%-off deal each day
it's open, with a slot each hour of its opening hours; every active venue is
listed for the feed.

The pure helpers run everywhere; the rest needs a disposable database:

    IMPULSE_TEST_DATABASE_URL=postgresql+psycopg://localhost/impulse_test uv run pytest tests/test_standard_offers.py
"""
import os
import uuid
from datetime import date, datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from deal_schedules import SYDNEY
from opening_hours import hourly_slots, week_hours
from schemas import StandardOfferInput

TEST_DB = os.environ.get("IMPULSE_TEST_DATABASE_URL")
TUE = date(2026, 11, 3)  # a Tuesday
HOURS = "Mon: Closed, Tue: 5pm–9pm, Wed: 11:15am–1pm, Thu: 6pm–2am, Fri: 6pm–2am, Sat: 6pm–2am, Sun: Closed"


# ── Pure helpers ──────────────────────────────────────────────────────────────

def test_week_hours_reads_the_venue_form():
    week = week_hours(HOURS)
    assert week[0] is None and week[6] is None
    assert week[1] == (17 * 60, 21 * 60)
    assert week[3] == (18 * 60, 24 * 60)  # past midnight stops at midnight


def test_days_the_text_leaves_out_are_closed_unless_a_default_is_given():
    assert week_hours(None) == {d: None for d in range(7)}
    assert week_hours("Every day 4pm–midnight")[2] == (16 * 60, 24 * 60)
    assert week_hours("rubbish", default=(1, 2))[4] == (1, 2)


def test_slots_start_each_hour_and_end_an_hour_before_closing():
    assert hourly_slots((17 * 60, 21 * 60)) == ["5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"]
    assert hourly_slots((11 * 60 + 15, 13 * 60)) == ["11:30 AM"]  # rounds up to the half hour
    assert hourly_slots((22 * 60, 24 * 60)) == ["10:00 PM", "11:00 PM"]
    assert hourly_slots(None) == [] and hourly_slots((60, 90)) == []


@pytest.mark.parametrize("bad", [{"original_price": 0}, {"total_spots": 0}, {"max_group_size": 0}])
def test_offer_body_rejects_nonsense(bad):
    with pytest.raises(ValidationError):
        StandardOfferInput(**{"original_price": 40, "total_spots": 10, **bad})


# ── Generator and endpoints, against a real database ─────────────────────────

@pytest.fixture(scope="module")
def env():
    if not TEST_DB:
        pytest.skip("IMPULSE_TEST_DATABASE_URL not set")
    live = os.environ.get("DATABASE_URL", "")
    if "supabase" in TEST_DB or TEST_DB == live:
        pytest.fail("IMPULSE_TEST_DATABASE_URL must be a disposable local database, not Supabase")

    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    import main
    from auth import get_current_user, get_optional_user
    from database import Base, get_db
    from models import User, Venue

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

    owner, stranger = str(uuid.uuid4()), str(uuid.uuid4())
    with Session() as db:
        db.add_all([User(id=owner, email="owner@example.test"), User(id=stranger, email="x@example.test")])
        lanes = Venue(owner_id=owner, name="Test Lanes", category="Bowling", opening_hours=HOURS,
                      stripe_account_id="acct_lanes", stripe_transfers_status="active")
        # Open all day every day, so today's deal exists whenever the tests run (before 11pm).
        allday = Venue(owner_id=owner, name="All Day Arcade", category="Arcade",
                       opening_hours="Every day 12am–midnight",
                       stripe_account_id="acct_allday", stripe_transfers_status="active")
        browse = Venue(owner_id=owner, name="Browse Only Bar", category="Bar")
        hidden = Venue(owner_id=owner, name="Closed Down", category="Bar", is_active=False)
        demo = Venue(owner_id=owner, name="Demo Venue", category="Bar", is_demo=True)
        db.add_all([lanes, allday, browse, hidden, demo])
        db.commit()
        ids = SimpleNamespace(owner=owner, stranger=stranger, lanes=lanes.id, allday=allday.id, browse=browse.id)

    user = {"sub": owner}
    main.app.dependency_overrides[get_db] = _db
    main.app.dependency_overrides[get_current_user] = lambda: user
    main.app.dependency_overrides[get_optional_user] = lambda: None
    yield SimpleNamespace(api=TestClient(main.app), Session=Session, ids=ids, user=user)
    main.app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def _standard_deals(env, venue_id):
    from models import Deal
    with env.Session() as db:
        return db.query(Deal).filter(Deal.venue_id == venue_id, Deal.is_standard == True).all()  # noqa: E712


def _today_open(now: datetime) -> bool:
    return now.astimezone(SYDNEY).hour < 23


def test_generator_makes_a_full_price_deal_from_the_days_hours(env):
    from deal_schedules import generate_scheduled_deals
    from models import DealSchedule
    with env.Session() as db:
        offer = DealSchedule(venue_id=env.ids.lanes, is_standard=True, title="Lane", category="Bowling",
                             unit="/lane", original_price=40, discount_pct=0, slots=[], weekdays=list(range(7)),
                             total_spots=8, max_group_size=6)
        db.add(offer)
        db.commit()
        sid = offer.id
        generate_scheduled_deals(db, now=datetime(2026, 11, 2, 12, 0, tzinfo=SYDNEY))   # Monday: closed
        generate_scheduled_deals(db, now=datetime(2026, 11, 3, 18, 30, tzinfo=SYDNEY))  # Tuesday 6:30pm
        generate_scheduled_deals(db, now=datetime(2026, 11, 3, 18, 45, tzinfo=SYDNEY))  # again: no repeat
    deals = [d for d in _standard_deals(env, env.ids.lanes) if d.schedule_id == sid]
    assert len(deals) == 1
    d = deals[0]
    assert d.deal_date == TUE and d.slots == ["5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"]
    assert float(d.deal_price) == 40.0 and float(d.discount_pct) == 0 and d.is_standard
    assert d.expires_at == datetime(2026, 11, 3, 20, 0, tzinfo=SYDNEY)
    with env.Session() as db:
        db.query(DealSchedule).filter(DealSchedule.id == sid).delete()
        db.commit()


def test_owner_sets_edits_and_removes_the_offer(env):
    vid = env.ids.allday
    assert env.api.get(f"/venues/{vid}/standard-offer").json() is None

    body = {"title": "", "unit": "pp", "original_price": 25, "total_spots": 12, "max_group_size": 4}
    r = env.api.put(f"/venues/{vid}/standard-offer", json=body)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["title"] == "All Day Arcade · $25 pp" and o["auto_title"]
    assert o["hours_set"] and o["payments_ready"]

    now = datetime.now(SYDNEY)
    if _today_open(now):
        assert o["slots_today"]
        [deal] = _standard_deals(env, vid)
        assert float(deal.deal_price) == 25.0 and deal.spots_remaining == 12

        # An edit reaches today's deal; spots already taken stay taken.
        from models import Deal
        with env.Session() as db:
            db.query(Deal).filter(Deal.id == deal.id).update({"spots_remaining": 10})
            db.commit()
        r = env.api.put(f"/venues/{vid}/standard-offer", json={**body, "title": "Arcade card", "original_price": 30, "total_spots": 6})
        assert r.status_code == 200 and r.json()["title"] == "Arcade card"
        [deal] = _standard_deals(env, vid)
        assert float(deal.deal_price) == 30.0 and deal.total_spots == 6 and deal.spots_remaining == 4
        assert deal.title == "Arcade card"

    # Still one offer per venue.
    from models import DealSchedule
    with env.Session() as db:
        assert db.query(DealSchedule).filter(DealSchedule.venue_id == vid, DealSchedule.is_standard == True).count() == 1  # noqa: E712

    # Not a weekly deal: the schedules endpoints don't see it.
    listed = env.api.get(f"/deal-schedules?venue_id={vid}").json()
    assert o["id"] not in [s["id"] for s in listed]
    assert env.api.get(f"/deal-schedules/{o['id']}").status_code == 404

    assert env.api.delete(f"/venues/{vid}/standard-offer").status_code == 204
    assert env.api.get(f"/venues/{vid}/standard-offer").json() is None
    assert all(not d.is_active for d in _standard_deals(env, vid))


def test_the_feed_only_sends_standard_deals_to_builds_that_ask(env):
    vid = env.ids.allday
    r = env.api.put(f"/venues/{vid}/standard-offer", json={"original_price": 15, "total_spots": 5})
    assert r.status_code == 200
    if not _today_open(datetime.now(SYDNEY)):
        pytest.skip("past 11pm in Sydney: no standard deal today")
    old = env.api.get("/deals").json()
    assert all(not d["is_standard"] for d in old)
    new = env.api.get("/deals?include_standard=true").json()
    mine = [d for d in new if d["venue_id"] == vid]
    assert mine and mine[0]["is_standard"] and mine[0]["discount_pct"] == 0
    # The venue's own deal list and stats leave it out.
    assert all(d["venue_id"] != vid or not d.get("is_standard") for d in env.api.get(f"/venues/{vid}/deals").json())
    env.api.delete(f"/venues/{vid}/standard-offer")


def test_browse_lists_every_active_public_venue(env):
    names = [v["name"] for v in env.api.get("/venues/browse").json()]
    assert "Browse Only Bar" in names and "Test Lanes" in names
    assert "Closed Down" not in names and "Demo Venue" not in names


def test_strangers_cannot_touch_a_venues_offer(env):
    env.user["sub"] = env.ids.stranger
    try:
        assert env.api.get(f"/venues/{env.ids.lanes}/standard-offer").status_code == 403
        assert env.api.put(f"/venues/{env.ids.lanes}/standard-offer", json={"original_price": 1, "total_spots": 1}).status_code == 403
        assert env.api.delete(f"/venues/{env.ids.lanes}/standard-offer").status_code == 403
    finally:
        env.user["sub"] = env.ids.owner
