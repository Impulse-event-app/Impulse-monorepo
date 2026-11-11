"""Venue portal media and onboarding helpers: automatic deal titles, the photo
gallery, deal videos, and the Google Maps (SerpApi) place lookup.

The pure helpers run everywhere. The endpoint tests need a disposable
database, like test_deal_schedules.py:

    createdb impulse_test
    IMPULSE_TEST_DATABASE_URL=postgresql+psycopg://localhost/impulse_test uv run pytest tests/test_venue_media.py
"""
import os
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import google_places
from deal_schedules import auto_title, deal_from_schedule
from routers.reels import newest_live_deal_by_reel
from routers.venues import _sync_photos
from schemas import gallery

TEST_DB = os.environ.get("IMPULSE_TEST_DATABASE_URL")


# ── Automatic titles ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("price,unit,want", [
    (15, "pp", "Flight Club · $15 pp"),
    (12.5, "pp", "Flight Club · $12.50 pp"),
    (40, "/group", "Flight Club · $40/group"),
    (20, None, "Flight Club · $20 pp"),
])
def test_auto_title_is_venue_and_price(price, unit, want):
    assert auto_title("Flight Club", price, unit) == want


def test_scheduled_deal_keeps_auto_title_and_video():
    s = SimpleNamespace(
        venue_id="v", id="s", title="Flight Club · $15 pp", auto_title=True, reel_id="r",
        category="Bar", description=None, unit="pp", original_price=30, discount_pct=50,
        slots=["7:00 PM"], max_group_size=6, total_spots=10,
    )
    from datetime import date
    d = deal_from_schedule(s, date(2026, 11, 3))
    assert d.auto_title is True and d.reel_id == "r" and d.title == "Flight Club · $15 pp"


# ── Photo gallery ─────────────────────────────────────────────────────────────

def test_gallery_sets_cover_and_drops_blanks_and_repeats():
    f = {"image_urls": ["a", " ", "b", "a"]}
    _sync_photos(f)
    assert f == {"image_urls": ["a", "b"], "image_url": "a"}


def test_emptied_gallery_clears_cover():
    f = {"image_urls": []}
    _sync_photos(f)
    assert f == {"image_urls": [], "image_url": None}


def test_single_photo_client_becomes_one_photo_gallery():
    f = {"image_url": "a"}
    _sync_photos(f)
    assert f == {"image_url": "a", "image_urls": ["a"]}


def test_gallery_is_capped():
    with pytest.raises(HTTPException):
        _sync_photos({"image_urls": [str(i) for i in range(9)]})


def test_gallery_falls_back_to_cover_for_old_venues():
    assert gallery(SimpleNamespace(image_urls=[], image_url="a")) == ["a"]
    assert gallery(SimpleNamespace(image_urls=["b", "c"], image_url="b")) == ["b", "c"]
    assert gallery(SimpleNamespace(image_urls=None, image_url=None)) == []


# ── Discover: a reel books the deal it advertises ─────────────────────────────

def test_reel_points_at_its_newest_live_linked_deal():
    from datetime import datetime, timedelta, timezone
    t0 = datetime(2026, 11, 1, tzinfo=timezone.utc)
    mk = lambda reel, mins, **kw: SimpleNamespace(  # noqa: E731
        reel_id=reel, is_active=kw.get("active", True), spots_remaining=kw.get("spots", 3),
        created_at=t0 + timedelta(minutes=mins))
    old, new, dead, other = mk("r1", 0), mk("r1", 5), mk("r1", 9, active=False), mk(None, 20)
    assert newest_live_deal_by_reel([old, new, dead, other]) == {"r1": new}


# ── Google place parsing (SerpApi google_maps shapes) ─────────────────────────

PLACE = {
    "place_results": {
        "title": "Flight Club Darts Newtown",
        "place_id": "ChIJ_test_newtown",
        "address": "385 King St, Newtown NSW 2042",
        "phone": "(02) 8000 0000",
        "website": "https://flightclubdarts.com.au/",
        "gps_coordinates": {"latitude": -33.8977, "longitude": 151.1787},
        "operating_hours": {
            "tuesday": "4 pm–12 am", "wednesday": "4 pm–12 am", "thursday": "4 pm–1 am",
            "friday": "12 pm–2 am", "saturday": "12 pm–2 am", "sunday": "12–10 pm", "monday": "Closed",
        },
        "popular_times": {
            "graph_results": {
                "friday": [
                    {"time": "12 PM", "busyness_score": 10},
                    {"time": "6 PM", "busyness_score": 70},
                    {"time": "9 PM", "busyness_score": 100},
                    {"time": "1 AM", "busyness_score": 30},
                ],
                "monday": [],
            },
        },
    }
}


def test_place_results_parse():
    p = google_places.place_from_response(PLACE)
    assert p["place_id"] == "ChIJ_test_newtown" and p["lat"] == -33.8977
    assert p["opening_hours"] == (
        "Mon: Closed, Tue: 4pm–12am, Wed: 4pm–12am, Thu: 4pm–1am, "
        "Fri: 12pm–2am, Sat: 12pm–2am, Sun: 12pm–10pm"
    )
    fri = p["popular_times"]["Fri"]
    assert len(fri) == 24 and fri[12] == 10 and fri[18] == 70 and fri[21] == 100 and fri[1] == 30
    assert p["popular_times"]["Mon"] == [0] * 24 and set(p["popular_times"]) == set(google_places.DAYS)


def test_list_results_take_the_best_match():
    data = {"local_results": [{**PLACE["place_results"], "popular_times": None}, {"title": "Other"}]}
    p = google_places.place_from_response(data)
    assert p["name"] == "Flight Club Darts Newtown" and p["popular_times"] is None


@pytest.mark.parametrize("text,want", [
    ("11 am–10 pm", {"open": True, "from": "11:00", "to": "22:00"}),
    ("11:30 AM–9:30 PM", {"open": True, "from": "11:30", "to": "21:30"}),
    ("12–11 pm", {"open": True, "from": "12:00", "to": "23:00"}),
    ("11 am–2 pm, 5–10 pm", {"open": True, "from": "11:00", "to": "22:00"}),
    ("Open 24 hours", {"open": True, "from": "00:00", "to": "00:00"}),
    ("Closed", {"open": False, "from": "10:00", "to": "22:00"}),
    ("11 am – 4 pm", {"open": True, "from": "11:00", "to": "16:00"}),
])
def test_day_hours_parse(text, want):
    assert google_places.parse_day_hours(text) == want


def test_partial_or_unreadable_week_gives_no_hours():
    assert google_places.opening_hours_string({"monday": "11 am–10 pm"}) is None
    week = {d: "whenever" for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")}
    assert google_places.opening_hours_string(week) is None


def test_hours_as_list_of_days():
    raw = [{d: "5 pm–11 pm"} for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")]
    assert google_places.opening_hours_string(raw).startswith("Mon: 5pm–11pm, Tue: 5pm–11pm")


def test_no_graph_no_popular_times():
    assert google_places.popular_times(None) is None
    assert google_places.popular_times({"graph_results": {"monday": []}}) is None


def test_lookups_are_off_without_a_key(monkeypatch):
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    assert not google_places.configured()
    assert google_places.find_place("Flight Club", "385 King St") is None


# ── Endpoints, against a real database ────────────────────────────────────────

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
    from models import User, Venue, VenueReel

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
        mine = Venue(owner_id=owner, name="Flight Club", category="Bar",
                     stripe_account_id="acct_fc", stripe_transfers_status="active")
        theirs = Venue(owner_id=stranger, name="Elsewhere", category="Bar")
        db.add_all([mine, theirs])
        db.commit()
        their_reel = VenueReel(venue_id=theirs.id, video_url="https://x/elsewhere.mp4")
        db.add(their_reel)
        db.commit()
        ids = SimpleNamespace(owner=owner, stranger=stranger, mine=mine.id, theirs=theirs.id, their_reel=their_reel.id)

    user = {"sub": owner}
    main.app.dependency_overrides[get_db] = _db
    main.app.dependency_overrides[get_current_user] = lambda: user
    yield SimpleNamespace(api=TestClient(main.app), Session=Session, ids=ids, user=user)
    main.app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def _deal_body(env, **kw):
    return {"venue_id": env.ids.mine, "category": "Bar", "original_price": 30, "discount_pct": 50,
            "deal_date": "2030-01-04", "slots": ["7pm"], "total_spots": 10, "unit": "pp", **kw}


def test_unnamed_deal_gets_and_follows_an_auto_title(env):
    r = env.api.post("/deals", json=_deal_body(env))
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["title"] == "Flight Club · $15 pp" and d["auto_title"] is True

    d = env.api.patch(f"/deals/{d['id']}", json={"discount_pct": 40}).json()
    assert d["title"] == "Flight Club · $18 pp" and d["auto_title"] is True

    d = env.api.patch(f"/deals/{d['id']}", json={"title": "Darts for two"}).json()
    assert d["title"] == "Darts for two" and d["auto_title"] is False
    d = env.api.patch(f"/deals/{d['id']}", json={"discount_pct": 50}).json()
    assert d["title"] == "Darts for two"

    d = env.api.patch(f"/deals/{d['id']}", json={"title": ""}).json()
    assert d["title"] == "Flight Club · $15 pp" and d["auto_title"] is True


def test_named_deal_keeps_its_name(env):
    d = env.api.post("/deals", json=_deal_body(env, title="  Lane night ")).json()
    assert d["title"] == "Lane night" and d["auto_title"] is False


def test_unnamed_schedule_gets_an_auto_title(env):
    body = {"venue_id": env.ids.mine, "category": "Bar", "original_price": 50, "discount_pct": 20,
            "slots": ["10pm"], "weekdays": [4], "starts_on": "2030-01-01", "total_spots": 3, "unit": "/group"}
    r = env.api.post("/deal-schedules", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["title"] == "Flight Club · $40/group" and r.json()["auto_title"] is True


def test_gallery_round_trip(env):
    r = env.api.patch(f"/venues/{env.ids.mine}", json={"image_urls": ["https://p/1.jpg", "https://p/2.jpg"]})
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["image_urls"] == ["https://p/1.jpg", "https://p/2.jpg"] and v["image_url"] == "https://p/1.jpg"
    v = env.api.patch(f"/venues/{env.ids.mine}", json={"image_urls": ["https://p/2.jpg", "https://p/1.jpg"]}).json()
    assert v["image_url"] == "https://p/2.jpg"


def test_venue_uploads_and_attaches_a_video(env):
    from auth import SUPABASE_URL
    base = f"{SUPABASE_URL}/storage/v1/object/public/venue-reels/{env.ids.owner}"
    r = env.api.post(f"/venues/{env.ids.mine}/reels", json={"video_url": f"{base}/a.mp4", "poster_url": f"{base}/a.jpg"})
    assert r.status_code == 201, r.text
    reel = r.json()
    assert [x["id"] for x in env.api.get(f"/venues/{env.ids.mine}/reels").json()] == [reel["id"]]

    d = env.api.post("/deals", json=_deal_body(env, reel_id=reel["id"])).json()
    assert d["reel_id"] == reel["id"]
    full = env.api.get(f"/deals/{d['id']}").json()
    assert full["reel_video_url"] == f"{base}/a.mp4" and full["reel_poster_url"] == f"{base}/a.jpg"

    feed = {x["id"]: x for x in env.api.get("/reels").json()}
    assert feed[reel["id"]]["deal_id"] == d["id"]


def test_video_must_be_the_venues_own_upload(env):
    from auth import SUPABASE_URL
    other = f"{SUPABASE_URL}/storage/v1/object/public/venue-reels/{env.ids.stranger}/a.mp4"
    assert env.api.post(f"/venues/{env.ids.mine}/reels", json={"video_url": other}).status_code == 400
    assert env.api.post(f"/venues/{env.ids.mine}/reels", json={"video_url": "https://evil/a.mp4"}).status_code == 400


def test_deal_cannot_use_another_venues_video(env):
    r = env.api.post("/deals", json=_deal_body(env, reel_id=env.ids.their_reel))
    assert r.status_code == 400


def test_strangers_cannot_list_a_venues_videos(env):
    env.user["sub"] = env.ids.stranger
    try:
        assert env.api.get(f"/venues/{env.ids.mine}/reels").status_code == 403
    finally:
        env.user["sub"] = env.ids.owner


def test_lookup_without_a_key_finds_nothing(env, monkeypatch):
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    r = env.api.get("/venues/lookup", params={"name": "Flight Club", "address": "385 King St"})
    assert r.status_code == 200 and r.json()["found"] is False


def test_linking_a_place_fetches_popular_times(env, monkeypatch):
    import routers.venues as venues
    monkeypatch.setattr(google_places, "place_details", lambda pid: google_places.place_from_response(PLACE))
    monkeypatch.setattr(venues, "SessionLocal", env.Session)  # the background refresh's session
    r = env.api.patch(f"/venues/{env.ids.mine}", json={"google_place_id": "ChIJ_test_newtown"})
    assert r.status_code == 200, r.text
    v = env.api.get(f"/venues/{env.ids.mine}").json()
    assert v["google_place_id"] == "ChIJ_test_newtown" and v["popular_times"]["Fri"][21] == 100


def test_real_serpapi_hours_list():
    # place_results.hours as SerpApi returned it for Flight Club Newtown (2026-11-11).
    hours = [{"wednesday": "11:30 am–11 pm"}, {"thursday": "11:30 am–12 am"}, {"friday": "11:30 am–1 am"},
             {"saturday": "11:30 am–1 am"}, {"sunday": "11:30 am–11 pm"}, {"monday": "4–11 pm"}, {"tuesday": "4–11 pm"}]
    p = google_places._place({"place_id": "x", "title": "Flight Club Newtown", "hours": hours})
    assert p["opening_hours"] == (
        "Mon: 4pm–11pm, Tue: 4pm–11pm, Wed: 11:30am–11pm, Thu: 11:30am–12am, "
        "Fri: 11:30am–1am, Sat: 11:30am–1am, Sun: 11:30am–11pm"
    )
    assert p["popular_times"] is None


# ── Complimentary video shoot request (one per venue) ─────────────────────────

@pytest.fixture
def mailbox(env, monkeypatch):
    from models import Venue
    from routers import venues
    box = []
    monkeypatch.setattr(venues, "send_email", lambda to, subject, body, reply_to=None: box.append(
        {"to": to, "subject": subject, "body": body, "reply_to": reply_to}))
    yield box
    with env.Session() as db:        # each test starts with the shoot not yet asked for
        db.query(Venue).update({Venue.video_shoot_requested_at: None})
        db.commit()


def test_video_shoot_request_emails_rahul_with_the_deal(env, mailbox, monkeypatch):
    monkeypatch.setitem(env.user, "email", "frank@example.test")
    deal = env.api.post("/deals", json=_deal_body(env)).json()
    r = env.api.post(f"/venues/{env.ids.mine}/video-shoot", json={"deal_id": deal["id"]})
    assert r.status_code == 202, r.text
    [m] = mailbox
    assert m["to"] == ["rahul@impulseapp.au"]
    assert m["subject"] == "Video shoot request: Flight Club"
    assert m["reply_to"] == "frank@example.test"
    assert "Flight Club · $15 pp" in m["body"] and "$15 pp (usually $30 pp)" in m["body"]


def test_video_shoot_is_one_per_venue(env, mailbox):
    assert env.api.get(f"/venues/{env.ids.mine}").json()["video_shoot_requested_at"] is None
    assert env.api.post(f"/venues/{env.ids.mine}/video-shoot", json={}).status_code == 202
    assert env.api.get(f"/venues/{env.ids.mine}").json()["video_shoot_requested_at"]
    r = env.api.post(f"/venues/{env.ids.mine}/video-shoot", json={})
    assert r.status_code == 409 and len(mailbox) == 1


def test_video_shoot_request_for_a_repeating_deal(env, mailbox):
    body = {"venue_id": env.ids.mine, "category": "Bar", "original_price": 50, "discount_pct": 20,
            "slots": ["10pm"], "weekdays": [4, 5], "starts_on": "2030-01-01", "total_spots": 3, "unit": "/group"}
    s = env.api.post("/deal-schedules", json=body).json()
    r = env.api.post(f"/venues/{env.ids.mine}/video-shoot", json={"schedule_id": s["id"]})
    assert r.status_code == 202, r.text
    assert "Fri, Sat from 2030-01-01, every week" in mailbox[0]["body"]
    assert "$40/group (usually $50/group)" in mailbox[0]["body"]


def test_video_shoot_request_is_owner_only(env, mailbox):
    r = env.api.post(f"/venues/{env.ids.theirs}/video-shoot", json={})
    assert r.status_code == 403 and not mailbox


def test_failed_send_is_reported_and_can_be_retried(env, mailbox, monkeypatch):
    from mailer import MailNotConfigured
    from routers import venues
    sent = venues.send_email

    def boom(*a, **k):
        raise MailNotConfigured("no smtp")
    monkeypatch.setattr(venues, "send_email", boom)
    assert env.api.post(f"/venues/{env.ids.mine}/video-shoot", json={}).status_code == 502
    assert env.api.get(f"/venues/{env.ids.mine}").json()["video_shoot_requested_at"] is None
    monkeypatch.setattr(venues, "send_email", sent)
    assert env.api.post(f"/venues/{env.ids.mine}/video-shoot", json={}).status_code == 202
