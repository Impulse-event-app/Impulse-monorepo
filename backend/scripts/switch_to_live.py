"""Clear sandbox Stripe data from the database when moving to live Stripe keys.

While the deployed app runs on sandbox keys (sk_test_), every Stripe ID it
saves (cus_, acct_, pi_, seti_, pm_, po_) belongs to the sandbox. Live Stripe
does not recognise them, so they must go before the live keys are switched on:

  - users: stripe_customer_id               (a fresh live Customer is made on next use)
  - venues: stripe_account_id + status      (each venue does Payments setup again on live)
           pilot_ends_at                    (the free pilot restarts when the live account is made)
  - open bookings still holding sandbox money (collecting/confirmed with a hold or saved card)
           -> cancelled, spots returned     (they were test bookings; nothing real was charged)
  - bookings: stripe_payout_id, payout_status
  - seats: stripe_payment_method_id, hold_status, hold_expires_at

Pinch-era rows are left alone (their IDs are not Stripe IDs).

Dry run by default (prints what would change). From backend/:

    uv run python scripts/switch_to_live.py           # dry run against DATABASE_URL
    uv run python scripts/switch_to_live.py --apply   # do it, in one transaction

Run it after taking a backup, with the old (sandbox) backend stopped or about
to be redeployed with live keys, so nothing new is written in between.
"""
import sys

from sqlalchemy import or_

from booking_flow import release_spots
from database import SessionLocal, engine
from models import Booking, BookingParticipant, User, Venue

APPLY = "--apply" in sys.argv
OPEN = ("collecting", "confirmed")


def main() -> None:
    print(f"Database: {engine.url.host}/{engine.url.database}  ({'APPLY' if APPLY else 'dry run'})\n")
    with SessionLocal() as db:
        users = db.query(User).filter(User.stripe_customer_id.isnot(None)).all()
        venues = db.query(Venue).filter(or_(Venue.stripe_account_id.isnot(None),
                                            Venue.pilot_ends_at.isnot(None))).all()
        seats = db.query(BookingParticipant).filter(or_(
            BookingParticipant.stripe_payment_method_id.isnot(None),
            BookingParticipant.hold_status.isnot(None),
            BookingParticipant.deposit_payment_id.like("pi\\_%"),
            BookingParticipant.deposit_payment_id.like("seti\\_%"),
        )).all()
        booking_ids = {p.booking_id for p in seats}
        payouts = db.query(Booking).filter(Booking.stripe_payout_id.isnot(None)).all()
        booking_ids |= {b.id for b in payouts}
        bookings = db.query(Booking).filter(Booking.id.in_(booking_ids)).all() if booking_ids else []
        open_test = [b for b in bookings if b.status in OPEN]

        print(f"users with a sandbox Customer:      {len(users)}")
        print(f"venues with a sandbox account/pilot: {len(venues)}")
        for v in venues:
            print(f"    {v.name}: {v.stripe_account_id or '-'} ({v.stripe_transfers_status or '-'}), "
                  f"pilot ends {v.pilot_ends_at or '-'}")
        print(f"seats with sandbox card/hold data:  {len(seats)}")
        print(f"bookings with sandbox payouts:      {len(payouts)}")
        print(f"open test bookings to cancel:       {len(open_test)}")
        for b in open_test:
            print(f"    {b.id} ({b.status}, {b.num_people} people)")

        for u in users:
            u.stripe_customer_id = None
        for v in venues:
            v.stripe_account_id = None
            v.stripe_transfers_status = None
            v.stripe_requirements = None
            v.stripe_status_updated_at = None
            v.pilot_ends_at = None
        for b in open_test:
            release_spots(db, b)   # no-op unless the booking holds spots
            b.status = "cancelled"
        for b in payouts:
            b.stripe_payout_id = None
            b.payout_status = None
        for p in seats:
            p.stripe_payment_method_id = None
            p.hold_status = None
            p.hold_expires_at = None

        if APPLY:
            db.commit()
            print("\nDone. Venues must now complete Payments setup on live Stripe.")
        else:
            db.rollback()
            print("\nDry run: nothing changed. Re-run with --apply to clear it.")


if __name__ == "__main__":
    main()
