"""Shared setup for the sandbox end-to-end scripts.

Runs the real FastAPI app in-process (sign-in stubbed) against a LOCAL database
copy and the Stripe SANDBOX, so every hold, capture and payout is real Stripe
test data and nothing touches live. See README.md for how to run.
"""
import os
import sys

# Must be imported before any backend module: `database` builds its engine from
# DATABASE_URL at import, and .env points at the live database.
if "database" in sys.modules:
    raise SystemExit("Import _harness before any backend module (it must set DATABASE_URL first)")
os.environ["DATABASE_URL"] = os.environ.get("SANDBOX_DATABASE_URL", "postgresql://localhost/impulse_local")
os.environ["HUDDLE_SWEEP_INTERVAL"] = "0"

import datetime as dt  # noqa: E402
import uuid  # noqa: E402
from zoneinfo import ZoneInfo  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

import auth  # noqa: E402
import main  # noqa: E402
import stripe_client  # noqa: E402
from database import SessionLocal  # noqa: E402
from environment import refuse_production  # noqa: E402

refuse_production("run sandbox end-to-end tests")
from models import Booking, BookingParticipant, Deal, User, Venue  # noqa: E402
import database  # noqa: E402

# Check the connection the app actually opened, not just the variable we set.
_url = database.engine.url
if _url.host not in (None, "localhost", "127.0.0.1", "::1") or "supabase" in str(_url):
    raise SystemExit(f"Refusing to run: the app is connected to {_url.host}, not a local database")

if not stripe_client.STRIPE_SECRET_KEY.startswith(("sk_test_", "rk_test_")):
    raise SystemExit("Sandbox keys only: STRIPE_SECRET_KEY must be sk_test_ or rk_test_")
VENUE_ID = os.environ.get("SANDBOX_VENUE_ID")
if not VENUE_ID:
    raise SystemExit("Set SANDBOX_VENUE_ID to a local venue whose sandbox Stripe account is active")

SC = stripe_client.client()
SYD = ZoneInfo("Australia/Sydney")
_current: dict = {}
main.app.dependency_overrides[auth.get_current_user] = lambda: dict(_current)
main.app.dependency_overrides[auth.get_optional_user] = lambda: dict(_current)
api = TestClient(main.app)


def as_(user: dict) -> TestClient:
    """Act as `user` ({"id", "email"}) for the next requests."""
    _current.clear()
    _current.update({"sub": user["id"], "email": user["email"]})
    return api


def ok(r):
    assert r.status_code < 300, (r.status_code, r.text)
    return r.json()


def date_text(days: int) -> str:
    d = (dt.datetime.now(SYD) + dt.timedelta(days=days)).date()
    return f"{d:%A} {d.day} {d:%B %Y}"


def test_user(email: str, name: str) -> dict:
    """A local-only guest with a fake email; created once."""
    with SessionLocal() as db:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u = User(id=str(uuid.uuid4()), email=email, full_name=name)
            db.add(u)
            db.commit()
        return {"id": u.id, "email": u.email}


def venue_context() -> dict:
    with SessionLocal() as db:
        v = db.get(Venue, VENUE_ID)
        if not v or not v.stripe_account_id:
            raise SystemExit(f"Venue {VENUE_ID} has no sandbox Stripe account")
        o = db.get(User, v.owner_id)
        return {"owner": {"id": o.id, "email": o.email}, "acct": v.stripe_account_id, "pilot": v.pilot_ends_at}


def new_deal(days: int, title: str) -> str:
    """A $25-a-person deal at 7:00 PM, `days` from today in Sydney."""
    with SessionLocal() as db:
        d = Deal(venue_id=VENUE_ID, title=title, category="Darts", unit="pp", original_price=25,
                 discount_pct=0, deal_price=25, date=date_text(days), slots=["7:00 PM"],
                 max_group_size=8, total_spots=40, spots_remaining=40, is_active=True)
        db.add(d)
        db.commit()
        return d.id


def set_col(model, row_id, **cols) -> None:
    with SessionLocal() as db:
        row = db.get(model, row_id)
        for k, v in cols.items():
            setattr(row, k, v)
        db.commit()


def hold(user: dict, booking_id: str, share_cents: int, card: str):
    """Claim a spot the way the app does, with a Stripe test card standing in
    for PaymentSheet. Returns (intent, confirmed booking)."""
    c = as_(user)
    intent = ok(c.post(f"/bookings/{booking_id}/pay/start", json={"expected_share_cents": share_cents}))
    confirm = SC.v1.setup_intents.confirm if intent["intent_type"] == "setup" else SC.v1.payment_intents.confirm
    confirm(intent["intent_id"], {"payment_method": card, "return_url": "https://impulseapp.au"})
    return intent, ok(c.post(f"/bookings/{booking_id}/pay", json={"intent_id": intent["intent_id"]}))


def book_two(user: dict, deal_id: str) -> tuple:
    """A two-person booking paid by one person. Returns (booking, share_cents)."""
    b = ok(as_(user).post("/bookings", json={"deal_id": deal_id, "slot_time": "7:00 PM",
                                              "num_people": 2, "split": False}))
    return b, b["deposit_amount_cents"] + b["balance_amount_cents"]


def seat(booking_id: str) -> dict:
    """The booking and its (first) seat, as stored locally."""
    with SessionLocal() as db:
        b = db.get(Booking, booking_id)
        p = db.query(BookingParticipant).filter(BookingParticipant.booking_id == booking_id).first()
        return dict(status=b.status, payout=b.stripe_payout_id, payout_status=b.payout_status,
                    intent=p.deposit_payment_id, hold=p.hold_status, deposit=p.deposit_cents,
                    pm=p.stripe_payment_method_id, followup=p.payment_followup, note=p.payment_note)


def payout_line(acct: str, payout_id) -> str:
    if not payout_id:
        return "no instant payout recorded"
    po = SC.v1.payouts.retrieve(payout_id, None, {"stripe_account": acct}).to_dict()
    return f"payout {payout_id}: {po['method']} {po['amount']}c status={po['status']}"
