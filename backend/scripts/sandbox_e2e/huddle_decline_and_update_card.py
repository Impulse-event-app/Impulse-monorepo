"""Huddle collapse, a card that can't be charged, and the guest updating it.

Huddle: one member holds, the other never pays, the deadline passes -> the hold
is cancelled (nothing charged), the Huddle collapses, spots go back.

Decline + update card: a far-off booking saves a card that attaches but never
charges (pm_card_chargeCustomerFail). The sweep's hold declines and the seat
is flagged; the guest holds a good card through /card; the venue redeems and
is paid out.
"""
import _harness  # noqa: F401  (first: points the app at the local database)
from sqlalchemy import text

import booking_flow as flow
from _harness import (SC, as_, book_two, date_text, hold, new_deal, ok, payout_line, seat, set_col,
                      test_user, venue_context)
from database import SessionLocal
from models import Deal

ctx = venue_context()
GUEST = test_user("stripe-test-guest@example.test", "Stripe Test Guest")
FRIEND = test_user("stripe-test-guest2@example.test", "Stripe Test Friend")


def spots(deal_id: str) -> int:
    with SessionLocal() as db:
        return db.get(Deal, deal_id).spots_remaining


print("\n===== Huddle collapse =====")
deal = new_deal(1, "Sandbox test: huddle")
h = ok(as_(GUEST).post("/huddles", json={"group_size": 2}))
ok(as_(FRIEND).post(f"/huddles/join/{h['join_token']}", json={}))
ok(as_(FRIEND).post(f"/huddles/{h['id']}/ballot", json={"picks": [deal]}))
ok(as_(GUEST).post(f"/huddles/{h['id']}/ballot", json={"picks": [deal]}))
hv = ok(as_(GUEST).patch(f"/bookings/{h['id']}/split", json={"split_mode": "even"}))
print(f"1. resolved, status={hv['status']}, spots left {spots(deal)}")
intent, _ = hold(GUEST, h["id"], hv["my_share"]["share_cents"], "pm_card_au")
print(f"2. organiser held {SC.v1.payment_intents.retrieve(intent['intent_id']).to_dict()['amount']}c; friend never pays")
with SessionLocal() as db:
    db.execute(text("update bookings set share_deadline = now() - interval '1 minute' where id = :b"), {"b": h["id"]})
    db.commit()
    counts = flow.sweep_deadlines(db)
pi = SC.v1.payment_intents.retrieve(intent["intent_id"]).to_dict()
print(f"3. collapsed={counts['collapsed']}; organiser's hold {pi['status']}, charged {pi['amount_received']}c; "
      f"spots back to {spots(deal)}")

print("\n===== Decline, then update card =====")
deal = new_deal(10, "Sandbox test: decline")
b, share = book_two(GUEST, deal)
_, paid = hold(GUEST, b["id"], share, "pm_card_chargeCustomerFail")
set_col(Deal, deal, date=date_text(3))
with SessionLocal() as db:
    counts = flow.sweep_holds(db)
row = seat(b["id"])
mine = next(x for x in ok(as_(GUEST).get("/bookings/me")) if x["id"] == b["id"])
print(f"1. sweep hold_failures={counts['hold_failures']}; seat {row['hold']}, followup={row['followup']}; "
      f"guest sees card_needs_update={mine['card_needs_update']}")
c = as_(GUEST)
upd = ok(c.post(f"/bookings/{b['id']}/card/start"))
SC.v1.payment_intents.confirm(upd["intent_id"], {"payment_method": "pm_card_au", "return_url": "https://impulseapp.au"})
after = ok(c.post(f"/bookings/{b['id']}/card", json={"intent_id": upd["intent_id"]}))
print(f"2. card updated: seat {seat(b['id'])['hold']}, card_needs_update={after['card_needs_update']}")
rr = ok(as_(ctx["owner"]).post(f"/bookings/redeem/{paid['confirmation_code']}"))
print(f"3. redeemed: charged {rr['total_charged_cents']}c, declines {rr['declines']}; "
      f"{payout_line(ctx['acct'], seat(b['id'])['payout'])}")
