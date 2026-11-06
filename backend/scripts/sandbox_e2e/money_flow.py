"""Hold at booking -> redeem at the door -> capture + instant payout.

Runs twice: inside the venue's pilot (Impulse fee $0) and after it (a flat
10%). The venue's pilot end date is restored afterwards.
"""
import _harness  # noqa: F401  (first: points the app at the local database)
import datetime as dt

from _harness import (SC, VENUE_ID, as_, book_two, hold, new_deal, ok, payout_line, seat, set_col,
                      test_user, venue_context)
from models import Venue

ctx = venue_context()
GUEST = test_user("stripe-test-guest@example.test", "Stripe Test Guest")


def run(label: str) -> None:
    print(f"\n===== {label} =====")
    deal = new_deal(1, "Sandbox test: money flow")
    b, share = book_two(GUEST, deal)
    intent, paid = hold(GUEST, b["id"], share, "pm_card_au")
    pi = SC.v1.payment_intents.retrieve(intent["intent_id"]).to_dict()
    print(f"1. held {pi['amount']}c ({pi['status']}, capture={pi['capture_method']}) "
          f"to {pi['transfer_data']['destination']}; code {paid['confirmation_code']}")
    rr = ok(as_(ctx["owner"]).post(f"/bookings/redeem/{paid['confirmation_code']}"))
    pi = SC.v1.payment_intents.retrieve(intent["intent_id"]).to_dict()
    print(f"2. redeemed: charged {rr['total_charged_cents']}c, declines {rr['declines']}; "
          f"application_fee_amount={pi.get('application_fee_amount') or 0}")
    print(f"3. {payout_line(ctx['acct'], seat(b['id'])['payout'])}")


try:
    run("Pilot venue: fee should be 0")
    set_col(Venue, VENUE_ID, pilot_ends_at=dt.datetime(2020, 1, 1, tzinfo=dt.timezone.utc))
    run("After the pilot: fee should be a flat 10%")
finally:
    set_col(Venue, VENUE_ID, pilot_ends_at=ctx["pilot"])
    print(f"\npilot end date restored to {ctx['pilot']}")
