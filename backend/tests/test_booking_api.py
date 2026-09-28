"""End-to-end API tests for the one booking model — solo, "I'll pay for
everyone", Huddle Pay (split + invites), the guarantor, Huddles, venue
redemption and user search — through the real FastAPI app and a real
Postgres. Pinch is stubbed; every charge/refund it would receive is recorded.

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

    def charge(kind):
        def f(**kw):
            charges.append({"kind": kind, **kw})
            return {"id": f"pmt_{len(charges)}", "status": "approved"}
        return f

    saved = (payments.charge_deposit, payments.charge_balance, payments.refund_full, wallet.resolve_source)
    payments.charge_deposit = charge("deposit")
    payments.charge_balance = charge("balance")
    payments.refund_full = lambda **kw: charges.append({"kind": "refund", **kw}) or {"id": "ref_1"}
    wallet.resolve_source = lambda db, row, **kw: (f"pyr_{row.id[:6]}", f"src_{row.id[:6]}")

    ids = {k: str(uuid.uuid4()) for k in ("owner", "host", "sam", "alex", "jo")}
    names = {"owner": "Venue Owner", "host": "Rahul Host", "sam": "Sammy Tester", "alex": "Alex Tester", "jo": "Jo Tester"}
    day = datetime.now() + timedelta(days=7)
    with Session() as db:
        for k, uid in ids.items():
            db.add(User(id=uid, email=f"{k}@example.test", full_name=names[k]))
        venue = Venue(owner_id=ids["owner"], name="Test Lanes", category="Bowling")
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
    payments.charge_deposit, payments.charge_balance, payments.refund_full, wallet.resolve_source = saved
    Base.metadata.drop_all(engine)


def ok(r, code=200):
    assert r.status_code == code, (r.status_code, r.text)
    return r.json() if r.content else None


def card(expected):
    return {"expected_deposit_cents": expected, "payment_method_id": "pm_test"}


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
    paid = ok(env["as"]("jo").post(f"/bookings/{b['id']}/pay", json=card(b["deposit_amount_cents"])))
    assert paid["confirmation_code"] and paid["payment_status"] == "deposit_paid"


def test_group_without_split_is_one_payer(env):
    b = new_booking(env, n=3, split=False)
    assert not b["is_split"] and b["deposit_amount_cents"] + b["balance_amount_cents"] == 5550
    s0 = spots(env)
    paid = ok(env["as"]("host").post(f"/bookings/{b['id']}/pay", json=card(b["deposit_amount_cents"])))
    assert paid["confirmation_code"] and spots(env) == s0 - 3


def test_per_unit_deal_is_one_price_for_the_group(env):
    b = new_booking(env, n=4, split=False, key="room")
    assert b["deposit_amount_cents"] + b["balance_amount_cents"] == 3600


def test_share_deadline_is_slot_minus_an_hour_in_sydney(env):
    b = new_booking(env, n=2)
    v = ok(env["as"]("host").get(f"/bookings/{b['id']}/split"))
    local = datetime.fromisoformat(v["share_deadline"]).astimezone(VENUE_TZ)
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
    assert sam.post(f"/bookings/{bid}/pay", json=card(400)).status_code == 409     # not locked in

    host = env["as"]("host")
    s0 = spots(env)
    ok(host.post(f"/bookings/{bid}/pay", json=card(430)))
    assert spots(env) == s0 - 3

    sam = env["as"]("sam")
    assert sam.post(f"/bookings/{bid}/pay", json=card(401)).status_code == 409     # consent guard
    ok(sam.post(f"/bookings/{bid}/pay", json=card(400)))

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
    ok(alex.post(f"/bookings/{bid}/pay", json=card(280)))
    with env["engine"].begin() as x:
        x.execute(text("update deals set deal_price = 18.50 where id=:d"), {"d": env["deals"]["pp"]})

    codes = {ok(env["as"](w).get(f"/bookings/{bid}/split"))["confirmation_code"] for w in ("host", "sam", "alex")}
    assert len(codes) == 1 and None not in codes


def test_guarantor_charges_initiator_once_at_deadline(env):
    host = env["as"]("host")
    b = new_booking(env, n=3)
    bid = b["id"]
    v = ok(host.get(f"/bookings/{bid}/split"))
    ok(host.post(f"/bookings/{bid}/seats/{v['participants'][1]['id']}/invite", json={"user_id": env["ids"]["sam"]}))
    ok(host.post(f"/bookings/{bid}/pay", json=card(v["my_share"]["deposit_cents"])))
    past_deadline(env, bid)
    n0 = len(env["charges"])
    assert sweep(env)["guaranteed"] == 2
    g = env["charges"][n0:]
    assert all(c["nonce"].startswith(f"guarantor-{bid}-") and c["source_id"] == f"src_{env['ids']['host'][:6]}" for c in g)
    sweep(env)
    assert len(env["charges"]) == n0 + 2
    v = ok(host.get(f"/bookings/{bid}/split"))
    assert v["status"] == "confirmed" and v["confirmation_code"]

    owner = env["as"]("owner")
    n0 = len(env["charges"])
    rr = ok(owner.post(f"/bookings/redeem/{v['confirmation_code']}"))
    assert rr["declines"] == 0
    assert all(c["source_id"] == f"src_{env['ids']['host'][:6]}" for c in env["charges"][n0:])  # guaranteed balances too
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
    assert env["as"]("sam").post(f"/bookings/{hid}/pay", json=card(1)).status_code == 409
    ids = [p["id"] for p in hv["participants"]]
    hv = ok(env["as"]("host").patch(f"/bookings/{hid}/split", json={
        "split_mode": "custom", "amounts": {ids[0]: hv["locked_price_cents"] - 1000, ids[1]: 1000}}))
    ok(env["as"]("host").post(f"/bookings/{hid}/pay", json=card(hv["my_share"]["deposit_cents"])))
    sv = ok(env["as"]("sam").get(f"/huddles/{hid}"))
    assert sv["my_share"]["share_cents"] == 1000
    ok(env["as"]("sam").post(f"/bookings/{hid}/pay", json=card(sv["my_share"]["deposit_cents"])))
    assert ok(env["as"]("sam").get(f"/huddles/{hid}"))["status"] == "confirmed"


def test_huddle_collapse_refunds_and_returns_spots(env):
    hv = _resolved_huddle(env, second="jo")
    hid = hv["id"]
    hv = ok(env["as"]("host").patch(f"/bookings/{hid}/split", json={"split_mode": "even"}))
    ok(env["as"]("host").post(f"/bookings/{hid}/pay", json=card(hv["my_share"]["deposit_cents"])))
    s0 = spots(env)
    past_deadline(env, hid)
    n0 = len(env["charges"])
    sweep(env)
    assert [c["kind"] for c in env["charges"][n0:]] == ["refund"]
    assert ok(env["as"]("host").get(f"/huddles/{hid}"))["status"] == "collapsed"
    assert spots(env) == s0 + 2


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
