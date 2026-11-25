"""Set up App Review demo mode: one demo venue with deals all day, every day,
and the reviewer account flagged so it (and only it) can see that venue.

Why this is allowed in production when seed data isn't: the venue is flagged
Venue.is_demo, so real users never see it (demo_mode.hide_demo_venues), and its
bookings never touch Stripe (payments.DEMO_PREFIX). Nothing here takes money
or shows up for anyone but a demo account.

Usage (from backend/, with DATABASE_URL pointing at the target database):

    # Create or refresh the demo venue and its schedules, owned by an internal account:
    uv run python scripts/demo_mode.py venue --owner-email founder@impulseapp.au

    # Let an account see the demo venue (the App Review login):
    uv run python scripts/demo_mode.py flag appreview@impulseapp.au
    uv run python scripts/demo_mode.py unflag appreview@impulseapp.au

    # Turn demo mode off: deactivate the venue and its schedules, unflag everyone:
    uv run python scripts/demo_mode.py off

Against the production database each command also needs --production, so it
is never run there by accident.
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import SessionLocal  # noqa: E402
from deal_schedules import generate_scheduled_deals  # noqa: E402
from environment import APP_ENV, is_production_database  # noqa: E402
from models import DealSchedule, User, Venue  # noqa: E402

VENUE = dict(
    name="Demo Bar (App Review)",
    category="Bar",
    description=(
        "A demo venue for App Review. It isn't a real place: only demo accounts see it, "
        "and bookings here take no payment."
    ),
    address="Demo venue, not a real address",
    suburb="Sydney CBD",
    lat=-33.8688, lng=151.2093,
    opening_hours="Every day 7am to 11:30pm (demo)",
    image_url="https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&q=80&auto=format&fit=crop",
    image_urls=["https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&q=80&auto=format&fit=crop"],
)

EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

# Slots cover 7am to 11:30pm Sydney, so a reviewer in any time zone finds
# something bookable (the generator only makes today's deal, until its last slot).
SCHEDULES = [
    dict(title="Coffee and pastry for two", unit="/pair", original_price=18, discount_pct=30,
         slots=["7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM"], max_group_size=2, total_spots=40),
    dict(title="Long lunch, two courses", unit="pp", original_price=45, discount_pct=35,
         slots=["11:30 AM", "12:30 PM", "1:30 PM", "2:30 PM", "3:30 PM"], max_group_size=6, total_spots=40),
    dict(title="Happy hour cocktails", unit="pp", original_price=22, discount_pct=40,
         slots=["4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM"], max_group_size=8, total_spots=60),
    dict(title="Share plates and a jug", unit="/table", original_price=70, discount_pct=30,
         slots=["7:30 PM", "8:30 PM", "9:30 PM", "10:30 PM", "11:30 PM"], max_group_size=6, total_spots=40),
]


def _guard(production_flag: bool) -> None:
    url = os.environ.get("DATABASE_URL", "")
    prod = APP_ENV == "production" or is_production_database(url)
    if prod and not production_flag:
        sys.exit("This is the production database. Re-run with --production if you mean it.")
    print(f"Target: {'PRODUCTION' if prod else 'non-production'} database")


def _user_by_email(db, email: str) -> User:
    user = db.query(User).filter(User.email.ilike(email.strip())).first()
    if not user:
        sys.exit(f"No account with email {email}. Sign up in the app first, then run this again.")
    return user


def cmd_venue(db, owner_email: str) -> None:
    owner = _user_by_email(db, owner_email)
    venue = db.query(Venue).filter(Venue.is_demo == True).first()  # noqa: E712
    if venue is None:
        venue = Venue(owner_id=owner.id, is_demo=True, **VENUE)
        db.add(venue)
        db.flush()
        print(f"Created demo venue {venue.id}")
    else:
        for k, v in VENUE.items():
            setattr(venue, k, v)
        venue.owner_id = owner.id
        venue.is_active = True
        print(f"Updated demo venue {venue.id}")

    existing = {s.title: s for s in db.query(DealSchedule).filter(DealSchedule.venue_id == venue.id)}
    for spec in SCHEDULES:
        s = existing.get(spec["title"])
        if s is None:
            db.add(DealSchedule(venue_id=venue.id, category=VENUE["category"], weekdays=EVERY_DAY,
                                is_active=True, **spec))
            print(f"  + schedule: {spec['title']}")
        else:
            for k, v in spec.items():
                setattr(s, k, v)
            s.weekdays, s.is_active = EVERY_DAY, True
            print(f"  = schedule: {spec['title']}")
    db.commit()

    made = generate_scheduled_deals(db, venue_id=venue.id)
    print(f"Today's deals created now: {len(made)} (the backend adds the rest each day)")


def cmd_flag(db, email: str, on: bool) -> None:
    user = _user_by_email(db, email)
    if on and db.query(Venue.id).filter(Venue.owner_id == user.id, Venue.is_demo == False).first():  # noqa: E712
        sys.exit(f"{email} runs a real venue; use a separate account for App Review.")
    user.is_demo = on
    db.commit()
    print(f"{email}: is_demo = {on}")


def cmd_off(db) -> None:
    venues = db.query(Venue).filter(Venue.is_demo == True).all()  # noqa: E712
    for v in venues:
        v.is_active = False
        db.query(DealSchedule).filter(DealSchedule.venue_id == v.id).update({DealSchedule.is_active: False})
    n = db.query(User).filter(User.is_demo == True).update({User.is_demo: False})  # noqa: E712
    db.commit()
    print(f"Deactivated {len(venues)} demo venue(s) and their schedules; unflagged {n} account(s).")


def main() -> None:
    parser = argparse.ArgumentParser(description="App Review demo mode")
    parser.add_argument("--production", action="store_true", help="required against the production database")
    sub = parser.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("venue", help="create or refresh the demo venue and its schedules")
    v.add_argument("--owner-email", required=True, help="internal account that owns the venue (not the reviewer)")
    f = sub.add_parser("flag", help="let this account see the demo venue")
    f.add_argument("email")
    u = sub.add_parser("unflag", help="stop this account seeing the demo venue")
    u.add_argument("email")
    sub.add_parser("off", help="deactivate demo venues and unflag every account")
    args = parser.parse_args()

    _guard(args.production)
    db = SessionLocal()
    try:
        if args.cmd == "venue":
            cmd_venue(db, args.owner_email)
        elif args.cmd == "flag":
            cmd_flag(db, args.email, True)
        elif args.cmd == "unflag":
            cmd_flag(db, args.email, False)
        else:
            cmd_off(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
