"""Weekly deal schedules: which evenings a schedule runs, the deal it makes,
and the endpoints venues manage them with.

The pure helpers run everywhere. The generator and endpoint tests need a
disposable database, like test_reels.py:

    createdb impulse_test
    IMPULSE_TEST_DATABASE_URL=postgresql+psycopg://localhost/impulse_test uv run pytest tests/test_deal_schedules.py
"""
import os
import uuid
from datetime import date, datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from booking_logic import slot_at
from deal_schedules import SYDNEY, date_label, expires_for, normalize_slot, runs_on
from schemas import DealCreate, DealScheduleCreate

TEST_DB = os.environ.get("IMPULSE_TEST_DATABASE_URL")
TUE = date(2026, 11, 3)  # a Tuesday


# ── Pure helpers ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,want", [
    ("7pm", "7:00 PM"), ("7:30pm", "7:30 PM"), ("7:30 PM", "7:30 PM"), ("12pm", "12:00 PM"), ("12:15am", "12:15 AM"),
])
def test_slots_normalise_to_what_booking_deadlines_parse(raw, want):
    assert normalize_slot(raw) == want
    assert slot_at(date_label(TUE), normalize_slot(raw)) is not None


def test_unreadable_slot_is_rejected():
    with pytest.raises(ValueError):
        normalize_slot("after work")


def test_deal_ends_at_its_latest_slot_in_sydney():
    assert expires_for(TUE, ["9:00 PM", "6:00 PM"]) == datetime(2026, 11, 3, 21, 0, tzinfo=SYDNEY)


def test_runs_on_weekdays_within_its_date_range():
    s = SimpleNamespace(weekdays=[1, 5], starts_on=None, ends_on=None)
    assert runs_on(s, TUE) and not runs_on(s, date(2026, 11, 4))
    s.starts_on = date(2026, 11, 10)
    assert not runs_on(s, TUE)
    s.starts_on, s.ends_on = None, date(2026, 11, 2)
    assert not runs_on(s, TUE)


def test_schedule_body_tidies_slots_and_weekdays():
    body = DealScheduleCreate(
        venue_id="v", title="Lanes", category="Bowling", original_price=80, discount_pct=50,
        slots=["9pm", "6:30pm", "6:30 PM"], weekdays=[5, 1, 1], total_spots=4,
    )
    assert body.slots == ["6:30 PM", "9:00 PM"] and body.weekdays == [1, 5]


@pytest.mark.parametrize("bad", [
    {"weekdays": []}, {"weekdays": [7]}, {"slots": []},
    {"starts_on": "2026-11-10", "ends_on": "2026-11-01"}, {"discount_pct": 120},
])
def test_schedule_body_rejects_nonsense(bad):
    fields = dict(venue_id="v", title="Lanes", category="Bowling", original_price=80, discount_pct=50,
                  slots=["7pm"], weekdays=[1], total_spots=4)
    with pytest.raises(ValidationError):
        DealScheduleCreate(**{**fields, **bad})


def test_one_off_deal_needs_a_day():
    fields = dict(venue_id="v", title="Lanes", category="Bowling", original_price=80, discount_pct=50,
                  slots=["7pm"], total_spots=4)
    with pytest.raises(ValidationError):
        DealCreate(**fields)
    assert DealCreate(**fields, deal_date=TUE).slots == ["7:00 PM"]


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
    from auth import get_current_user
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
        lanes = Venue(owner_id=owner, name="Test Lanes", category="Bowling")
        pending = Venue(owner_id=owner, name="Pending Bar", category="Bar",
                        pinch_merchant_id="m_1", pinch_merchant_status="pending")
        db.add_all([lanes, pending])
        db.commit()
        ids = SimpleNamespace(owner=owner, stranger=stranger, lanes=lanes.id, pending=pending.id)

    user = {"sub": owner}
    main.app.dependency_overrides[get_db] = _db
    main.app.dependency_overrides[get_current_user] = lambda: user
    yield SimpleNamespace(api=TestClient(main.app), Session=Session, ids=ids, user=user)
    main.app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def _schedule(env, venue_id, **kw):
    from models import DealSchedule
    fields = dict(venue_id=venue_id, title="Two games", category="Bowling", original_price=80, discount_pct=25,
                  slots=["6:00 PM", "9:00 PM"], weekdays=[1], total_spots=6)
    with env.Session() as db:
        s = DealSchedule(**{**fields, **kw})
        db.add(s)
        db.commit()
        return s.id


def _deals_for(env, schedule_id):
    from models import Deal
    with env.Session() as db:
        return db.query(Deal).filter(Deal.schedule_id == schedule_id).all()


def test_generator_makes_tonights_deal_once(env):
    from deal_schedules import generate_scheduled_deals
    sid = _schedule(env, env.ids.lanes)
    tue_5pm = datetime(2026, 11, 3, 17, 0, tzinfo=SYDNEY)
    with env.Session() as db:
        assert len(generate_scheduled_deals(db, now=tue_5pm)) >= 1
        generate_scheduled_deals(db, now=tue_5pm)
    deals = _deals_for(env, sid)
    assert len(deals) == 1
    d = deals[0]
    assert d.deal_date == TUE and d.date == "Tuesday 3 November 2026"
    assert float(d.deal_price) == 60.0 and d.spots_remaining == 6 and d.is_active
    assert d.expires_at == datetime(2026, 11, 3, 21, 0, tzinfo=SYDNEY)


def test_generator_skips_other_days_late_evenings_paused_and_unpaid_venues(env):
    from deal_schedules import generate_scheduled_deals
    wrong_day = _schedule(env, env.ids.lanes, weekdays=[2])
    paused = _schedule(env, env.ids.lanes, is_active=False)
    unpaid = _schedule(env, env.ids.pending)
    late = _schedule(env, env.ids.lanes)
    with env.Session() as db:
        generate_scheduled_deals(db, now=datetime(2026, 11, 3, 17, 0, tzinfo=SYDNEY), venue_id=env.ids.pending)
        generate_scheduled_deals(db, now=datetime(2026, 11, 3, 21, 30, tzinfo=SYDNEY))
    for sid in (wrong_day, paused, unpaid, late):
        assert _deals_for(env, sid) == []


def test_owner_creates_lists_edits_and_deletes_a_schedule(env):
    body = dict(venue_id=env.ids.lanes, title="Late lanes", category="Bowling", original_price=50, discount_pct=20,
                slots=["10pm"], weekdays=[4], starts_on="2030-01-01", total_spots=3)
    r = env.api.post("/deal-schedules", json=body)
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["slots"] == ["10:00 PM"] and s["deal_price"] == 40.0
    assert _deals_for(env, s["id"]) == []  # starts in 2030

    listed = env.api.get(f"/deal-schedules?venue_id={env.ids.lanes}").json()
    assert s["id"] in [x["id"] for x in listed]

    r = env.api.put(f"/deal-schedules/{s['id']}", json={**body, "weekdays": [4, 5], "is_active": False})
    assert r.status_code == 200 and r.json()["weekdays"] == [4, 5] and not r.json()["is_active"]

    assert env.api.delete(f"/deal-schedules/{s['id']}").status_code == 204
    assert env.api.get(f"/deal-schedules/{s['id']}").status_code == 404


def test_strangers_cannot_touch_a_venues_schedules(env):
    sid = _schedule(env, env.ids.lanes, starts_on=date(2030, 1, 1))
    env.user["sub"] = env.ids.stranger
    try:
        assert env.api.get(f"/deal-schedules?venue_id={env.ids.lanes}").status_code == 403
        assert env.api.get(f"/deal-schedules/{sid}").status_code == 403
        assert env.api.delete(f"/deal-schedules/{sid}").status_code == 403
    finally:
        env.user["sub"] = env.ids.owner


def test_one_off_deal_gets_its_label_and_end_time(env):
    r = env.api.post("/deals", json=dict(
        venue_id=env.ids.lanes, title="Launch night", category="Bowling", original_price=40, discount_pct=50,
        slots=["8pm", "6pm"], deal_date="2030-03-01", total_spots=4,
    ))
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["date"] == "Friday 1 March 2030" and d["slots"] == ["6:00 PM", "8:00 PM"]
    assert datetime.fromisoformat(d["expires_at"]) == datetime(2030, 3, 1, 20, 0, tzinfo=SYDNEY)

    r = env.api.patch(f"/deals/{d['id']}", json={"deal_date": "2030-03-02"})
    assert r.json()["date"] == "Saturday 2 March 2030"


def test_one_off_deal_in_the_past_is_refused(env):
    r = env.api.post("/deals", json=dict(
        venue_id=env.ids.lanes, title="Too late", category="Bowling", original_price=40, discount_pct=50,
        slots=["8pm"], deal_date="2020-01-01", total_spots=4,
    ))
    assert r.status_code == 400


def test_feed_hides_deals_whose_last_slot_has_passed(env):
    from models import Deal
    with env.Session() as db:
        db.add(Deal(venue_id=env.ids.lanes, title="Old news", category="Bowling", original_price=10, discount_pct=0,
                    deal_price=10, date="Monday 1 January 2024", slots=["7:00 PM"], total_spots=2, spots_remaining=2,
                    expires_at=datetime(2024, 1, 1, 19, 0, tzinfo=SYDNEY)))
        db.commit()
    titles = [d["title"] for d in env.api.get("/deals").json()]
    assert "Old news" not in titles and "Launch night" in titles
