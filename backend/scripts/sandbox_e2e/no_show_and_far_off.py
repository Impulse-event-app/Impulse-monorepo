"""No-show and far-off bookings.

No-show: hold for tomorrow, move the slot into the past, sweep -> only the 10%
is captured and the rest released; the booking becomes no_show.

Far-off: book 10 days out -> card saved (SetupIntent, no hold); move the slot to
3 days out, sweep -> off-session hold placed; redeem -> captured and paid out.
"""
import _harness  # noqa: F401  (first: points the app at the local database)
import booking_flow as flow
from _harness import (SC, as_, book_two, date_text, hold, new_deal, ok, payout_line, seat, set_col,
                      test_user, venue_context)
from database import SessionLocal
from models import Deal

ctx = venue_context()
GUEST = test_user("stripe-test-guest@example.test", "Stripe Test Guest")


def sweep() -> dict:
    with SessionLocal() as db:
        return flow.sweep_holds(db)


print("\n===== No-show =====")
deal = new_deal(1, "Sandbox test: no-show")
b, share = book_two(GUEST, deal)
hold(GUEST, b["id"], share, "pm_card_au")
print(f"1. held {share}c; deposit is {seat(b['id'])['deposit']}c")
set_col(Deal, deal, date=date_text(-2))
print(f"2. slot moved two days into the past; sweep -> {sweep()}")
row = seat(b["id"])
pi = SC.v1.payment_intents.retrieve(row["intent"]).to_dict()
print(f"3. booking {row['status']}; captured {pi['amount_received']}c, released {pi['amount'] - pi['amount_received']}c")
print(f"4. {payout_line(ctx['acct'], row['payout'])}")
set_col(Deal, deal, date=date_text(1))

print("\n===== Far-off booking (10 days out) =====")
deal = new_deal(10, "Sandbox test: far-off")
b, share = book_two(GUEST, deal)
intent, paid = hold(GUEST, b["id"], share, "pm_card_au")
print(f"1. {intent['intent_type']} {intent['intent_id']}: card saved, hold={seat(b['id'])['hold']}")
print(f"2. sweep while still 10 days out -> {sweep()} (should stay saved: {seat(b['id'])['hold']})")
set_col(Deal, deal, date=date_text(3))
print(f"3. slot moved to 3 days out; sweep -> {sweep()}")
row = seat(b["id"])
pi = SC.v1.payment_intents.retrieve(row["intent"]).to_dict()
print(f"4. off-session hold: {row['intent']} {pi['status']} {pi['amount']}c")
rr = ok(as_(ctx["owner"]).post(f"/bookings/redeem/{paid['confirmation_code']}"))
print(f"5. redeemed: charged {rr['total_charged_cents']}c, declines {rr['declines']}; "
      f"{payout_line(ctx['acct'], seat(b['id'])['payout'])}")

print("\n===== Cancellation =====")
deal = new_deal(1, "Sandbox test: cancel")
b, share = book_two(GUEST, deal)
hold(GUEST, b["id"], share, "pm_card_au")
out = ok(as_(GUEST).post(f"/bookings/{b['id']}/cancel"))
row = seat(b["id"])
pi = SC.v1.payment_intents.retrieve(row["intent"]).to_dict()
print(f"1. cancelled (deposit forfeited={out['depositForfeited']}): captured {pi['amount_received']}c, "
      f"released {pi['amount'] - pi['amount_received']}c; {payout_line(ctx['acct'], row['payout'])}")
