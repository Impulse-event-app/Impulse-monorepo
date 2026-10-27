"""
Give one venue a believable booking history: past evenings of finished deals
with redeemed bookings, busiest around 7–8:30pm and quiet late. It feeds the
venue portal's "Past bookings" timeline, quietest-stretch hint and Deal
performance cards.

Usage:
    python seed_history.py --venue-id <uuid> [--weeks 8] [--dry-run]
    python seed_history.py --venue-id <uuid> --wipe

Every deal this makes has an id derived from (venue, date, index), so --wipe
finds exactly those rows and nothing the venue made itself. The deals are all
in the past and inactive, so guests never see them in the app. No money moves
and nothing is sent to Pinch.

It writes to whatever DATABASE_URL points at. Check that before running.
"""

from __future__ import annotations

import argparse
import random
import re
import secrets
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from booking_logic import deposit_split
from database import SessionLocal
from deal_schedules import date_label
from models import Booking, BookingParticipant, Deal, Venue

SYDNEY = ZoneInfo("Australia/Sydney")
NAMESPACE = uuid.UUID("6f1d1c3e-3c1a-4f5e-9a51-5eed0b0c4a11")
MAX_DEALS_PER_NIGHT = 2
WIPE_WEEKS = 52

# Relative demand by half-hour: a modest lunch, a dead mid-afternoon, then a
# build to a 7–8:30pm peak that falls away late.
DEMAND = {
    10 * 60: 0.08, 10 * 60 + 30: 0.10, 11 * 60: 0.15, 11 * 60 + 30: 0.22,
    12 * 60: 0.32, 12 * 60 + 30: 0.35, 13 * 60: 0.28, 13 * 60 + 30: 0.18,
    14 * 60: 0.08, 14 * 60 + 30: 0.06, 15 * 60: 0.07, 15 * 60 + 30: 0.10,
    16 * 60: 0.20, 16 * 60 + 30: 0.25, 17 * 60: 0.35, 17 * 60 + 30: 0.45,
    18 * 60: 0.70, 18 * 60 + 30: 0.85, 19 * 60: 0.95, 19 * 60 + 30: 0.90,
    20 * 60: 0.80, 20 * 60 + 30: 0.60, 21 * 60: 0.30, 21 * 60 + 30: 0.20,
    22 * 60: 0.15, 22 * 60 + 30: 0.18, 23 * 60: 0.10, 23 * 60 + 30: 0.08,
}
NIGHT = {0: 0.6, 1: 0.6, 2: 0.7, 3: 1.0, 4: 1.5, 5: 1.6, 6: 0.8}   # Mon … Sun

# (title, usual price, discount %, unit, first slot, last slot) by venue category.
OFFERS = {
    "Bar": [
        ("Long lunch spritz", 24, 30, "pp", 12 * 60, 14 * 60 + 30),
        ("Two-for-one cocktails", 36, 50, "pp", 17 * 60, 20 * 60),
        ("Happy hour wines", 16, 40, "pp", 16 * 60, 18 * 60),
        ("Late-night tap beers", 12, 30, "pp", 21 * 60, 23 * 60),
        ("Share plates + jug", 60, 25, "/table", 18 * 60, 21 * 60),
    ],
    "Bowling": [
        ("Twilight lanes", 80, 40, "/lane", 17 * 60, 20 * 60),
        ("Late lanes + shoes", 70, 50, "/lane", 21 * 60, 23 * 60),
    ],
    "Karaoke": [
        ("Private room, 2 hours", 120, 40, "/room", 18 * 60, 21 * 60),
        ("Late-night room", 100, 50, "/room", 21 * 60 + 30, 23 * 60),
    ],
}
GENERIC = [
    ("Early evening special", 40, 30, "pp", 17 * 60, 19 * 60 + 30),
    ("Prime time", 45, 25, "pp", 19 * 60, 21 * 60),
    ("Last call", 35, 50, "pp", 21 * 60, 23 * 60),
]

FIRST_NAMES = [
    "Ava", "Liam", "Mia", "Noah", "Zoe", "Jack", "Chloe", "Leo", "Ruby", "Oscar",
    "Isla", "Henry", "Grace", "Lucas", "Ella", "Max", "Sophie", "Ethan", "Lily", "Kai",
]


DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _clock(text: str) -> int | None:
    """'11am' / '4:30pm' / 'midnight' → minutes since midnight."""
    t = text.strip().lower()
    if t == "midnight":
        return 24 * 60
    if t in ("noon", "midday"):
        return 12 * 60
    m = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", t)
    if not m:
        return None
    h = int(m.group(1)) % 12 + (12 if m.group(3) == "pm" else 0)
    return h * 60 + int(m.group(2) or 0)


def opening_hours(text: str | None) -> dict[int, tuple[int, int] | None]:
    """The venue form's 'Mon: 11am–10pm, ..., Sun: Closed' (or 'Every day 4pm–midnight')
    → {weekday: (open, close) or None}. Unreadable days fall back to 4pm–midnight."""
    week: dict[int, tuple[int, int] | None] = {d: (16 * 60, 24 * 60) for d in range(7)}
    for part in (text or "").split(","):
        m = re.match(r"\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Every day|Daily):?\s*(.+)$", part.strip())
        if not m:
            continue
        days = range(7) if m.group(1) in ("Every day", "Daily") else [DAY_NAMES.index(m.group(1))]
        rng = m.group(2).strip()
        if rng.lower() == "closed":
            for d in days:
                week[d] = None
            continue
        ends = [_clock(x) for x in re.split(r"[–-]", rng)]
        if len(ends) == 2 and None not in ends:
            open_, close = ends
            if close <= open_:
                close = 24 * 60   # past midnight: a deal's slots stay on its own date
            for d in days:
                week[d] = (open_, close)
    return week


def deal_id_for(venue_id: str, day: date, index: int) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{venue_id}:{day.isoformat()}:{index}"))


def slot_text(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"{h % 12 or 12}:{m:02d} {'AM' if h < 12 else 'PM'}"


def at(day: date, minutes: int) -> datetime:
    return datetime.combine(day, time(minutes // 60, minutes % 60), tzinfo=SYDNEY)


def wipe(db, venue_id: str) -> None:
    today = datetime.now(SYDNEY).date()
    ids = [
        deal_id_for(venue_id, today - timedelta(days=n), i)
        for n in range(1, WIPE_WEEKS * 7 + 1)
        for i in range(MAX_DEALS_PER_NIGHT)
    ]
    deals = db.query(Deal).filter(Deal.id.in_(ids)).all()
    bookings = 0
    for d in deals:
        for b in d.bookings:
            for p in b.participants:
                db.delete(p)
            db.delete(b)
            bookings += 1
        db.delete(d)
    db.commit()
    print(f"[wipe] Removed {len(deals)} seeded deal(s) and {bookings} booking(s).")


def seed(db, venue: Venue, weeks: int, rng: random.Random) -> tuple[int, int, int]:
    offers = OFFERS.get(venue.category, GENERIC)
    hours = opening_hours(venue.opening_hours)
    today = datetime.now(SYDNEY).date()
    codes: set[str] = set()
    n_deals = n_bookings = n_people = 0

    for back in range(weeks * 7, 0, -1):
        day = today - timedelta(days=back)
        open_hours = hours[day.weekday()]
        if open_hours is None:
            continue            # closed that day
        open_, close = open_hours
        night = NIGHT[day.weekday()]
        # Only offers that fit inside that day's hours, last start 30 min before close.
        fitting = []
        for title, usual, discount, unit, first, last in offers:
            first, last = max(first, open_), min(last, close - 30)
            if last >= first:
                fitting.append((title, usual, discount, unit, first, last))
        if not fitting:
            continue
        # Quieter days run one deal; busy ones two.
        count = min(len(fitting), MAX_DEALS_PER_NIGHT if night >= 1.0 else 1)
        for index, offer in enumerate(rng.sample(fitting, count)):
            deal_id = deal_id_for(venue.id, day, index)
            if db.get(Deal, deal_id):
                continue        # already seeded; run --wipe first to regenerate
            title, usual, discount, unit, first, last = offer
            slots = list(range(first, last + 1, 30))
            price = round(usual * (1 - discount / 100), 2)
            total_spots = rng.choice([20, 24, 30, 40])
            deal = Deal(
                id=deal_id, venue_id=venue.id, title=title, category=venue.category,
                unit=unit, original_price=usual, discount_pct=discount, deal_price=price,
                date=date_label(day), deal_date=day, slots=[slot_text(s) for s in slots],
                max_group_size=6, total_spots=total_spots, spots_remaining=total_spots,
                is_active=False, expires_at=at(day, slots[-1]),
                created_at=at(day, first) - timedelta(hours=rng.uniform(2, 30)),
            )
            db.add(deal)
            n_deals += 1

            held = 0
            for s in slots:
                # Roughly Poisson: expected groups per slot scale with demand and night.
                expected = DEMAND.get(s, 0.1) * night * 3.2
                groups = sum(1 for _ in range(12) if rng.random() < expected / 12)
                for _ in range(groups):
                    people = rng.choice([2, 2, 2, 3, 4, 4, 5, 6])
                    if held + people > total_spots:
                        break
                    roll = rng.random()
                    status = "cancelled" if roll < 0.04 else "confirmed" if roll < 0.08 else "redeemed"
                    if status != "cancelled":
                        held += people

                    code = "".join(secrets.choice("0123456789") for _ in range(6))
                    while code in codes:
                        code = "".join(secrets.choice("0123456789") for _ in range(6))
                    codes.add(code)

                    unit_cents = int(round(price * 100))
                    locked = unit_cents * people if unit == "pp" else unit_cents
                    booked_at = at(day, s) - timedelta(minutes=rng.randint(20, 8 * 60))
                    booking = Booking(
                        id=str(uuid.uuid4()), deal_id=deal_id, user_id=None,
                        slot_time=slot_text(s), num_people=people, total_paid=locked / 100,
                        confirmation_code=code, status=status,
                        redeemed_at=at(day, s) + timedelta(minutes=rng.randint(0, 25)) if status == "redeemed" else None,
                        created_at=booked_at, updated_at=booked_at,
                        locked_unit_price_cents=unit_cents, locked_price_cents=locked,
                        split_confirmed_at=booked_at, spots_held=status != "cancelled",
                    )
                    db.add(booking)
                    seat_id = str(uuid.uuid4())
                    deposit, balance = deposit_split(locked)
                    paid = "paid" if status == "redeemed" else "unpaid"
                    db.add(BookingParticipant(
                        id=seat_id, booking_id=booking.id, user_id=None,
                        display_name=rng.choice(FIRST_NAMES),
                        share_amount_cents=locked, deposit_cents=deposit, balance_cents=balance,
                        deposit_status="paid", balance_status=paid,
                    ))
                    db.flush()
                    booking.initiator_member_id = seat_id
                    n_bookings += 1
                    n_people += people if status != "cancelled" else 0
            deal.spots_remaining = total_spots - held

    # Codes are unique across all bookings; swap any that clash with real ones.
    clashes = {c for (c,) in db.query(Booking.confirmation_code).filter(Booking.confirmation_code.in_(codes)).all()}
    if clashes:
        for b in db.new:
            if isinstance(b, Booking) and b.confirmation_code in clashes:
                b.confirmation_code = None   # a past booking doesn't need a live code
    return n_deals, n_bookings, n_people


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--venue-id", required=True)
    parser.add_argument("--weeks", type=int, default=8)
    parser.add_argument("--wipe", action="store_true", help="remove this script's rows for the venue, then stop")
    parser.add_argument("--dry-run", action="store_true", help="build everything, report, and roll back")
    parser.add_argument("--seed", type=int, default=None, help="random seed, for a repeatable history")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        venue = db.get(Venue, args.venue_id)
        if not venue:
            raise SystemExit(f"No venue with id {args.venue_id}")
        print(f"Venue: {venue.name} ({venue.category}, {venue.suburb or 'no suburb'})")
        print(f"Database: {db.bind.url.render_as_string(hide_password=True)}")

        if args.wipe:
            wipe(db, venue.id)
            return

        deals, bookings, people = seed(db, venue, args.weeks, random.Random(args.seed))
        if args.dry_run:
            db.rollback()
            print(f"[dry run] Would add {deals} past deals, {bookings} bookings, {people} people. Nothing written.")
        else:
            db.commit()
            print(f"[seed] Added {deals} past deals, {bookings} bookings, {people} people over {args.weeks} weeks.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
