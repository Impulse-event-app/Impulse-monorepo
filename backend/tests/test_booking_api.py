"""End-to-end API tests for the one booking model — solo, "I'll pay for
everyone", Huddle Pay (split + invites), the guarantor, Huddles, venue
redemption and user search — through the real FastAPI app and a real
Postgres. Stripe is stubbed at the payments boundary; every hold, capture and
release it would receive is recorded.

Needs a disposable database (its tables are created and dropped here):

    createdb impulse_test
    IMPULSE_TEST_DATABASE_URL=postgresql+psycopg://localhost/impulse_test uv run pytest tests/test_booking_api.py

Skipped when IMPULSE_TEST_DATABASE_URL is unset.
"""
import os
import uuid
from datetime import datetime, timedelta

import pytest

TEST_DB = os.environ.get("IMPULSE_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DB, reason="IMPULSE_TEST_DATABASE_URL not set")

if TEST_DB:
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    import auth
    import booking_flow as flow
    import main
    import payments
    import payouts
    import wallet
    from booking_logic import VENUE_TZ
    from database import Base, get_db
    from models import Deal, User, Venue


@pytest.fixture(scope="module")
def env():
    # This fixture drops every table. Never let it near the real database.
    live = os.environ.get("DATABASE_URL", "")
    if "supabase" in TEST_DB or TEST_DB == live:
        pytest.fail("IMPULSE_TEST_DATABASE_URL must be a disposable local database, not Supabase")
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

    current = {"sub": None}
    main.app.dependency_overrides[get_db] = _db
    main.app.dependency_overrides[auth.get_current_user] = lambda: dict(current)
    main.app.dependency_overrides[auth.get_optional_user] = lambda: dict(current)

    charges = []
    intents = {}

    def record(kind, **kw):
        charges.append({"kind": kind, **kw})

    def create_hold(**kw):
        record("hold", **kw)
        pi = f"pi_{len(charges)}"
        intents[pi] = (kw["amount_cents"], f"pm_{kw['customer_id']}")
        return {"id": pi, "client_secret": f"{pi}_secret"}

    def held(pi):
        amount, pm = intents.get(pi, (0, None))
        return {"id": pi, "status": "requires_capture", "amount": amount,
                "payment_method": {"id": pm, "card": {"country": "AU"}}}

    def offsession(**kw):
        record("offsession", **kw)
        pi = f"pi_{kw['idempotency_key']}"
        intents[pi] = (kw["amount_cents"], kw["payment_method_id"])
        return held(pi)

    def sheet(row):
        row.stripe_customer_id = f"cus_{row.id[:6]}"
        return {"customer_id": row.stripe_customer_id, "customer_session_client_secret": "cuss"}

    patched = {
        (payments, "create_hold"): create_hold,
        (payments, "needs_setup_first"): lambda *a, **k: False,
        (payments, "retrieve_hold"): held,
        (payments, "place_offsession_hold"): offsession,
        (payments, "capture"): lambda **kw: record("capture", **kw) or {"id": kw["intent_id"], "status": "succeeded"},
        (payments, "cancel_hold"): lambda **kw: record("cancel", **kw),
        (payouts, "pay_out_booking"): lambda db, b: record("payout", booking_id=b.id),
        (wallet, "sheet_params"): sheet,
    }
    saved = {k: getattr(*k) for k in patched}
    for (mod, name), fn in patched.items():
        setattr(mod, name, fn)

    ids = {k: str(uuid.uuid4()) for k in ("owner", "host", "sam", "alex", "jo")}
    names = {"owner": "Venue Owner", "host": "Rahul Host", "sam": "Sammy Tester", "alex": "Alex Tester", "jo": "Jo Tester"}
    day = datetime.now() + timedelta(days=7)
    with Session() as db:
        for k, uid in ids.items():
            db.add(User(id=uid, email=f"{k}@example.test", full_name=names[k]))
        venue = Venue(owner_id=ids["owner"], name="Test Lanes", category="Bowling",
                      stripe_account_id="acct_test", stripe_transfers_status="active")
        db.add(venue)
        db.flush()
        deals = {}
        for key, price, unit in (("pp", 18.50, "pp"), ("room", 36.00, "/room·hr")):
            d = Deal(venue_id=venue.id, title=f"deal {key}", category="Bowling", unit=unit,
                     original_price=price, discount_pct=0, deal_price=price,
                     date=f"{day:%A} {day.day} {day:%B %Y}", slots=["4:00 PM", "7:00 PM"],
                     max_group_size=8, total_spots=40, spots_remaining=40, is_active=True)
            db.add(d)
            db.flush()
            deals[key] = d.id
        db.commit()

    client = TestClient(main.app)

    def as_(who):
        current["sub"] = ids[who]
        current["email"] = f"{who}@example.test"
        return client

    yield {"as": as_, "ids": ids, "deals": deals, "charges": charges, "engine": engine, "Session": Session}

    main.app.dependency_overrides.clear()
    for (mod, name), fn in saved.items():
        setattr(mod, name, fn)
    Base.metadata.drop_all(engine)


def ok(r, code=200):
    assert r.status_code == code, (r.status_code, r.text)
    return r.json() if r.content else None


def pay(client, booking_id, share_cents):
    """Claim a spot the way the app does: start the hold, then confirm it once
    PaymentSheet is done. Returns the confirm response (or the failed start)."""
    r = client.post(f"/bookings/{booking_id}/pay/start", json={"expected_share_cents": share_cents})
    if r.status_code != 200:
        return r
    return client.post(f"/bookings/{booking_id}/pay", json={"intent_id": r.json()["intent_id"]})


def whole(b):
    return b["deposit_amount_cents"] + b["balance_amount_cents"]


def spots(env, key="pp"):
    with env["engine"].connect() as x:
        return x.execute(text("select spots_remaining from deals where id=:d"), {"d": env["deals"][key]}).scalar()


def sweep(env):
    with env["Session"]() as db:
        return flow.sweep_deadlines(db)


def past_deadline(env, booking_id):
    with env["engine"].begin() as x:
        x.execute(text("update bookings set share_deadline = now() - interval '1 minute' where id=:b"), {"b": booking_id})


def new_booking(env, who="host", n=3, split=True, key="pp", **extra):
    c = env["as"](who)
    return ok(c.post("/bookings", json={"deal_id": env["deals"][key], "slot_time": "7:00 PM",
                                        "num_people": n, "split": split, **extra}), 201)


# ── Checkout without splitting ───────────────────────────────────────────────

def test_solo_booking_issues_code(env):
    b = new_booking(env, who="jo", n=1, split=False)
    paid = ok(pay(env["as"]("jo"), b["id"], whole(b)))
    assert paid["confirmation_code"] and paid["payment_status"] == "deposit_paid"


def test_group_without_split_is_one_payer(env):
    b = new_booking(env, n=3, split=False)
    assert not b["is_split"] and b["deposit_amount_cents"] + b["balance_amount_cents"] == 5550
    s0 = spots(env)
    paid = ok(pay(env["as"]("host"), b["id"], whole(b)))
    assert paid["confirmation_code"] and spots(env) == s0 - 3
    hold = [c for c in env["charges"] if c["kind"] == "hold"][-1]
    assert hold["amount_cents"] == 5550 and hold["destination"] == "acct_test"   # the whole bill, held not charged


def test_per_unit_deal_is_one_price_for_the_group(env):
    b = new_booking(env, n=4, split=False, key="room")
    assert b["deposit_amount_cents"] + b["balance_amount_cents"] == 3600


def test_venue_bookings_span_every_deal_owner_only(env):
    pp = new_booking(env, who="jo", n=1, split=False)
    room = new_booking(env, who="jo", n=2, split=False, key="room")
    venue_id = ok(env["as"]("owner").get(f"/deals/{env['deals']['pp']}"))["venue_id"]
    owner = env["as"]("owner")
    # The fixture's deals are undated and active, so they count as upcoming.
    page = ok(owner.get(f"/venues/{venue_id}/bookings", params={"view": "upcoming"}))
    listed = {b["id"]: b for b in page["bookings"]}
    assert pp["id"] in listed and room["id"] in listed
    assert listed[room["id"]]["deal_id"] == env["deals"]["room"]
    assert {d["id"] for d in page["deals"]} >= {env["deals"]["pp"], env["deals"]["room"]}
    assert {"deal pp", "deal room"} <= set(page["deal_titles"])
    assert page["page"] == 1 and page["totals"]["bookings"] >= 2

    one_deal = ok(owner.get(f"/venues/{venue_id}/bookings", params={"view": "upcoming", "deal": "deal room"}))
    assert {b["deal_id"] for b in one_deal["bookings"]} == {env["deals"]["room"]}
    # A date range only covers dated deals.
    ranged = ok(owner.get(f"/venues/{venue_id}/bookings", params={"view": "upcoming", "date_from": "2026-01-01"}))
    assert ranged["bookings"] == [] and ranged["totals"]["bookings"] == 0
    assert ok(owner.get(f"/venues/{venue_id}/bookings", params={"view": "past"}))["bookings"] == []

    assert env["as"]("jo").get(f"/venues/{venue_id}/bookings").status_code == 403


def test_recent_bookings_and_booked_slots_are_one_call_each(env):
    paid = new_booking(env, who="jo", n=2, split=False, key="room")
    ok(pay(env["as"]("jo"), paid["id"], whole(paid)))
    newest = new_booking(env, who="jo", n=1, split=False)
    venue_id = ok(env["as"]("owner").get(f"/deals/{env['deals']['pp']}"))["venue_id"]
    owner = env["as"]("owner")

    recent = ok(owner.get(f"/venues/{venue_id}/bookings/recent", params={"limit": 2}))
    assert len(recent) == 2 and recent[0]["id"] == newest["id"] and recent[0]["deal_title"] == "deal pp"

    # Only bookings that went ahead feed the busy-times chart.
    slots = ok(owner.get(f"/venues/{venue_id}/booked-slots"))
    assert {"slot_time": "7:00 PM", "num_people": 2} in [{k: s[k] for k in ("slot_time", "num_people")} for s in slots]
    assert all(set(s) == {"deal_date", "slot_time", "num_people", "created_at"} for s in slots)

    assert env["as"]("jo").get(f"/venues/{venue_id}/bookings/recent").status_code == 403
    assert env["as"]("jo").get(f"/venues/{venue_id}/booked-slots").status_code == 403


def test_share_deadline_is_slot_minus_an_hour_in_sydney(env):
    b = new_booking(env, n=2)
    v = ok(env["as"]("host").get(f"/bookings/{b['id']}/split"))
    # fromisoformat only accepts a trailing "Z" from Python 3.11; prod runs 3.9.
    local = datetime.fromisoformat(v["share_deadline"].replace("Z", "+00:00")).astimezone(VENUE_TZ)
    assert (local.hour, local.minute) == (18, 0), local


# ── Huddle Pay ───────────────────────────────────────────────────────────────

def test_split_must_add_up(env):
    r = env["as"]("host").post("/bookings", json={"deal_id": env["deals"]["pp"], "slot_time": "7:00 PM",
                                                  "num_people": 3, "split": True, "split_mode": "custom",
                                                  "amounts": [2000, 2000, 1000]})
    assert r.status_code == 400 and "need to total $55.50" in r.json()["detail"]


def test_huddle_pay_invites_lock_in_decline_and_one_code(env):
    host = env["as"]("host")
    b = new_booking(env, n=3, split_mode="custom", amounts=[2150, 2000, 1400])
    bid = b["id"]
    v = ok(host.get(f"/bookings/{bid}/split"))
    assert not v["locked_in"] and v["locked_price_cents"] == 5550
    seat_b, seat_c = v["participants"][1]["id"], v["participants"][2]["id"]

    ok(host.post(f"/bookings/{bid}/seats/{seat_b}/invite", json={"user_id": env["ids"]["sam"]}))
    ok(host.post(f"/bookings/{bid}/seats/{seat_c}/invite", json={"user_id": env["ids"]["alex"]}))
    assert host.post(f"/bookings/{bid}/seats/{seat_c}/invite", json={"user_id": env["ids"]["sam"]}).status_code == 409

    sam = env["as"]("sam")
    assert any(x["id"] == bid for x in ok(sam.get("/bookings/me")))
    sv = ok(sam.get(f"/bookings/{bid}/split"))
    assert sv["my_share"]["share_cents"] == 2000 and not sv["locked_in"]
    assert pay(sam, bid, 2000).status_code == 409     # not locked in

    host = env["as"]("host")
    s0 = spots(env)
    ok(pay(host, bid, 2150))
    assert spots(env) == s0 - 3

    sam = env["as"]("sam")
    assert pay(sam, bid, 2001).status_code == 409     # consent guard
    ok(pay(sam, bid, 2000))

    assert env["as"]("host").post(f"/bookings/{bid}/cancel").status_code == 409   # a friend has paid

    alex = env["as"]("alex")
    assert alex.post(f"/bookings/{bid}/decline").status_code == 204
    host = env["as"]("host")
    assert not ok(host.get(f"/bookings/{bid}/split"))["participants"][2]["claimed"]
    ok(host.post(f"/bookings/{bid}/seats/{seat_c}/invite", json={"user_id": env["ids"]["alex"]}))

    with env["engine"].begin() as x:                       # venue reprices mid-collection
        x.execute(text("update deals set deal_price = 40 where id=:d"), {"d": env["deals"]["pp"]})
    alex = env["as"]("alex")
    av = ok(alex.get(f"/bookings/{bid}/split"))
    assert av["my_share"]["share_cents"] == 1400
    ok(pay(alex, bid, 1400))
    with env["engine"].begin() as x:
        x.execute(text("update deals set deal_price = 18.50 where id=:d"), {"d": env["deals"]["pp"]})

    codes = {ok(env["as"](w).get(f"/bookings/{bid}/split"))["confirmation_code"] for w in ("host", "sam", "alex")}
    assert len(codes) == 1 and None not in codes


def test_guarantor_holds_on_initiator_once_at_deadline(env):
    host = env["as"]("host")
    b = new_booking(env, n=3)
    bid = b["id"]
    v = ok(host.get(f"/bookings/{bid}/split"))
    host = env["as"]("host")
    ok(host.post(f"/bookings/{bid}/seats/{v['participants'][1]['id']}/invite", json={"user_id": env["ids"]["sam"]}))
    ok(pay(host, bid, v["my_share"]["share_cents"]))
    past_deadline(env, bid)
    n0 = len(env["charges"])
    assert sweep(env)["guaranteed"] == 2
    g = env["charges"][n0:]
    host_card = f"pm_cus_{env['ids']['host'][:6]}"
    assert all(c["idempotency_key"].startswith(f"guarantor-{bid}-") and c["payment_method_id"] == host_card for c in g)
    sweep(env)
    assert len(env["charges"]) == n0 + 2
    v = ok(host.get(f"/bookings/{bid}/split"))
    assert v["status"] == "confirmed" and v["confirmation_code"]

    owner = env["as"]("owner")
    n0 = len(env["charges"])
    rr = ok(owner.post(f"/bookings/redeem/{v['confirmation_code']}"))
    assert rr["declines"] == 0 and rr["total_charged_cents"] == 5550
    done = env["charges"][n0:]
    assert [c["kind"] for c in done] == ["capture", "capture", "capture", "payout"]
    assert all(c["application_fee_cents"] == 0 for c in done if c["kind"] == "capture")   # pilot venue
    assert owner.post(f"/bookings/redeem/{v['confirmation_code']}").status_code == 409


# ── Huddle ───────────────────────────────────────────────────────────────────

def _resolved_huddle(env, second="sam"):
    host = env["as"]("host")
    h = ok(host.post("/huddles", json={"group_size": 2}), 201)
    other = env["as"](second)
    ok(other.post(f"/huddles/join/{h['join_token']}", json={}))
    ok(other.post(f"/huddles/{h['id']}/ballot", json={"picks": [env["deals"]["pp"]]}))
    return ok(env["as"]("host").post(f"/huddles/{h['id']}/ballot", json={"picks": [env["deals"]["pp"]]}))


def test_huddle_vote_then_uneven_split(env):
    s0 = spots(env)
    hv = _resolved_huddle(env)
    hid = hv["id"]
    assert hv["status"] == "collecting" and not hv["split_confirmed"] and spots(env) == s0 - 2
    assert pay(env["as"]("sam"), hid, 1).status_code == 409
    ids = [p["id"] for p in hv["participants"]]
    hv = ok(env["as"]("host").patch(f"/bookings/{hid}/split", json={
        "split_mode": "custom", "amounts": {ids[0]: hv["locked_price_cents"] - 1000, ids[1]: 1000}}))
    ok(pay(env["as"]("host"), hid, hv["my_share"]["share_cents"]))
    sv = ok(env["as"]("sam").get(f"/huddles/{hid}"))
    assert sv["my_share"]["share_cents"] == 1000
    ok(pay(env["as"]("sam"), hid, 1000))
    assert ok(env["as"]("sam").get(f"/huddles/{hid}"))["status"] == "confirmed"


def test_huddle_collapse_releases_holds_and_returns_spots(env):
    hv = _resolved_huddle(env, second="jo")
    hid = hv["id"]
    hv = ok(env["as"]("host").patch(f"/bookings/{hid}/split", json={"split_mode": "even"}))
    ok(pay(env["as"]("host"), hid, hv["my_share"]["share_cents"]))
    s0 = spots(env)
    past_deadline(env, hid)
    n0 = len(env["charges"])
    sweep(env)
    assert [c["kind"] for c in env["charges"][n0:]] == ["cancel"]     # the hold is released, nothing refunded
    assert ok(env["as"]("host").get(f"/huddles/{hid}"))["status"] == "collapsed"
    assert spots(env) == s0 + 2


# ── Old app builds ───────────────────────────────────────────────────────────

def test_pre_stripe_builds_are_told_to_update(env):
    b = new_booking(env, who="jo", n=1, split=False)
    r = env["as"]("jo").post(f"/bookings/{b['id']}/pay", json={"expected_deposit_cents": 185, "token": "tkn_old"})
    assert r.status_code == 426 and "Update the app" in r.json()["detail"]


def test_app_config_reports_the_minimum_version(env):
    assert "min_version" in ok(env["as"]("jo").get("/app/config"))


def test_cancelling_a_held_booking_captures_the_deposit(env):
    b = new_booking(env, who="jo", n=2, split=False)
    ok(pay(env["as"]("jo"), b["id"], whole(b)))
    n0 = len(env["charges"])
    out = ok(env["as"]("jo").post(f"/bookings/{b['id']}/cancel"))
    assert out["depositForfeited"] is True
    captures = [c for c in env["charges"][n0:] if c["kind"] == "capture"]
    assert [c["amount_cents"] for c in captures] == [b["deposit_amount_cents"]]


# ── Search ───────────────────────────────────────────────────────────────────

def test_user_search_is_name_only_and_needs_three_letters(env):
    host = env["as"]("host")
    hits = ok(host.get("/users/search", params={"q": "Samm"}))
    assert [h["display_name"] for h in hits] == ["Sammy Tester"]
    assert all(set(h) == {"id", "display_name", "recent"} for h in hits)
    assert all(h["recent"] for h in ok(host.get("/users/search", params={"q": "Sa"})))
    assert not any(h["id"] == env["ids"]["host"] for h in ok(host.get("/users/search", params={"q": "Rahul"})))
    assert ok(host.get("/users/search", params={"q": "sam@example.test"}))[0]["id"] == env["ids"]["sam"]
    assert ok(host.get("/users/search", params={"q": "sam@example"})) == []


# ── Live Activities ──────────────────────────────────────────────────────────

def test_live_activity_token_register_and_updates(env, monkeypatch):
    import live_activity
    from models import LiveActivityToken
    queued = []
    monkeypatch.setattr(live_activity, "enqueue", lambda ids: queued.append(set(ids)))

    host = env["as"]("host")
    b = new_booking(env, n=2)
    bid = b["id"]
    v = ok(host.get(f"/bookings/{bid}/split"))
    la = v["live_activity"]
    assert la["bookingId"] == bid and (la["paid"], la["total"]) == (0, 2) and la["phase"] == "collecting"

    token = "ab" * 32
    ok(host.put(f"/bookings/{bid}/live-activity-token", json={"push_token": token}), 204)
    ok(host.put(f"/bookings/{bid}/live-activity-token", json={"push_token": token}), 204)   # idempotent
    assert host.put(f"/bookings/{bid}/live-activity-token", json={"push_token": "not hex!"}).status_code == 422
    assert env["as"]("jo").put(f"/bookings/{bid}/live-activity-token",
                               json={"push_token": "cd" * 32}).status_code == 403          # not a member
    host = env["as"]("host")
    ok(host.post(f"/bookings/{bid}/seats/{v['participants'][1]['id']}/invite", json={"user_id": env["ids"]["sam"]}))
    sam = env["as"]("sam")
    assert ok(sam.get(f"/bookings/{bid}/split"))["live_activity"] is None                   # invitees get pushes
    assert sam.put(f"/bookings/{bid}/live-activity-token",
                   json={"push_token": "cd" * 32}).status_code == 403
    host = env["as"]("host")
    with env["Session"]() as db:
        rows = db.query(LiveActivityToken).filter_by(booking_id=bid).all()
        assert [r.push_token for r in rows] == [token] and rows[0].member_id == v["my_member_id"]

    queued.clear()
    share = ok(env["as"]("host").get(f"/bookings/{bid}/split"))["my_share"]["share_cents"]
    ok(pay(env["as"]("host"), bid, share))
    assert {bid} in queued                     # the pay's commit queued an update

    ok(env["as"]("host").delete(f"/bookings/{bid}/live-activity-token"), 204)
    with env["Session"]() as db:
        assert db.query(LiveActivityToken).filter_by(booking_id=bid).count() == 0
