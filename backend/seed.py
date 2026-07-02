"""
Seed the database with synthetic venues, deals, bookings, and interactions.

Usage:
    python seed.py --owner-id <your-supabase-user-uuid>

The owner-id must be a real user ID that already exists in auth.users (and
therefore in the public.users table).  If you haven't run the app yet, sign in
once so the trigger creates your row, then grab the UUID from Supabase dashboard
or by calling GET /users/me.

Options:
    --owner-id   UUID of the user who will own all seeded venues (required)
    --wipe       Drop all seeded rows before re-inserting (safe re-run
"""

import argparse
import random
import uuid
from datetime import datetime, timedelta, timezone

from database import SessionLocal
from models import Booking, Deal, User, UserVenueInteraction, Venue

# ── helpers ──────────────────────────────────────────────────────────────────

def _uid() -> str:
    return str(uuid.uuid4())


def _future_date(days_ahead: int) -> str:
    d = datetime.now(timezone.utc) + timedelta(days=days_ahead)
    return d.strftime("%-d %B %Y").lstrip("0")  # e.g. "5 July 2026"


def _expires(days_ahead: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days_ahead)


# ── synthetic data ────────────────────────────────────────────────────────────

VENUES = [
    dict(
        name="The Glenmore Hotel",
        category="Bar",
        description="Classic Rocks pub with rooftop views over the harbour.",
        address="96 Cumberland St, The Rocks NSW 2000",
        suburb="The Rocks",
        lat=-33.8598, lng=151.2073,
        phone="02 9247 4794",
        email="info@glenmore.com.au",
        website="https://theglenmore.com.au",
        opening_hours="Mon–Sun 11am–1am",
    ),
    dict(
        name="Babylon Rooftop Bar",
        category="Rooftop Bar",
        description="Sophisticated rooftop cocktail bar in the CBD.",
        address="Level 4, 118 King St, Sydney NSW 2000",
        suburb="Sydney CBD",
        lat=-33.8687, lng=151.2070,
        phone="02 9262 4744",
        email="events@babylonbar.com.au",
        website="https://babylonbar.com.au",
        opening_hours="Thu–Sat 5pm–3am",
    ),
    dict(
        name="Strike Bowling Darling Harbour",
        category="Bowling",
        description="Premium bowling lanes, cocktails, and arcade games.",
        address="The Galeries, 500 George St, Sydney NSW 2000",
        suburb="Darling Harbour",
        lat=-33.8752, lng=151.2010,
        phone="02 9280 0400",
        email="sydney@strikebowling.com.au",
        website="https://strikebowling.com.au",
        opening_hours="Mon–Thu 10am–11pm, Fri–Sat 10am–1am, Sun 10am–10pm",
    ),
    dict(
        name="Marquee Sydney",
        category="Nightclub",
        description="World-class superclub hosting international DJs every weekend.",
        address="Star Casino, 80 Pyrmont St, Pyrmont NSW 2009",
        suburb="Pyrmont",
        lat=-33.8698, lng=151.1945,
        phone="02 9777 9000",
        email="info@marquee.com.au",
        website="https://marquee.com.au",
        opening_hours="Fri–Sat 10pm–6am",
    ),
    dict(
        name="Ivy Pool Club",
        category="Pool Bar",
        description="Stunning rooftop pool bar with DJ sets on weekends.",
        address="320 George St, Sydney NSW 2000",
        suburb="Sydney CBD",
        lat=-33.8664, lng=151.2075,
        phone="02 9254 8100",
        email="hello@ivysydney.com.au",
        website="https://merivale.com/ivypool",
        opening_hours="Fri 4pm–midnight, Sat–Sun 1pm–midnight",
    ),
]

def _deals_for_venue(venue_id: str, venue_category: str) -> list[dict]:
    today = datetime.now(timezone.utc)
    deals: list[dict] = []

    if venue_category == "Bar":
        deals += [
            dict(
                venue_id=venue_id,
                title="Happy Hour Craft Beers",
                category="Drinks",
                description="Half-price craft beers from our rotating tap list.",
                unit="pp",
                original_price=12.00,
                discount_pct=50.00,
                date=_future_date(1),
                slots=["4:00 PM", "5:00 PM", "6:00 PM"],
                max_group_size=8,
                total_spots=40,
                spots_remaining=40,
                expires_at=_expires(1),
            ),
            dict(
                venue_id=venue_id,
                title="Rooftop Cocktail Package",
                category="Drinks",
                description="3-cocktail tasting package on the rooftop terrace.",
                unit="pp",
                original_price=45.00,
                discount_pct=30.00,
                date=_future_date(3),
                slots=["6:00 PM", "7:30 PM", "9:00 PM"],
                max_group_size=6,
                total_spots=24,
                spots_remaining=24,
                expires_at=_expires(3),
            ),
        ]
    elif venue_category == "Rooftop Bar":
        deals += [
            dict(
                venue_id=venue_id,
                title="Sunset Cocktails for Two",
                category="Drinks",
                description="2 cocktails + shared grazing board with harbour views.",
                unit="couple",
                original_price=80.00,
                discount_pct=25.00,
                date=_future_date(2),
                slots=["5:30 PM", "6:30 PM"],
                max_group_size=2,
                total_spots=16,
                spots_remaining=16,
                expires_at=_expires(2),
            ),
        ]
    elif venue_category == "Bowling":
        deals += [
            dict(
                venue_id=venue_id,
                title="2 Hours Bowling + Shoes",
                category="Activity",
                description="2 hours of unlimited bowling for your whole lane.",
                unit="/lane",
                original_price=65.00,
                discount_pct=35.00,
                date=_future_date(2),
                slots=["12:00 PM", "2:00 PM", "4:00 PM", "6:00 PM", "8:00 PM"],
                max_group_size=6,
                total_spots=30,
                spots_remaining=30,
                expires_at=_expires(2),
            ),
            dict(
                venue_id=venue_id,
                title="Bowling + Arcade Credits Bundle",
                category="Activity",
                description="1 hour bowling + $20 arcade credits per person.",
                unit="pp",
                original_price=42.00,
                discount_pct=40.00,
                date=_future_date(5),
                slots=["11:00 AM", "1:00 PM", "3:00 PM", "5:00 PM", "7:00 PM"],
                max_group_size=8,
                total_spots=48,
                spots_remaining=48,
                expires_at=_expires(5),
            ),
        ]
    elif venue_category == "Nightclub":
        deals += [
            dict(
                venue_id=venue_id,
                title="VIP Table for 4",
                category="Table",
                description="Reserved table with 1 bottle of spirits included.",
                unit="/table",
                original_price=350.00,
                discount_pct=20.00,
                date=_future_date(4),
                slots=["10:00 PM", "11:00 PM"],
                max_group_size=4,
                total_spots=8,
                spots_remaining=8,
                expires_at=_expires(4),
            ),
            dict(
                venue_id=venue_id,
                title="Guest List Entry",
                category="Entry",
                description="Skip the queue — guaranteed entry before midnight.",
                unit="pp",
                original_price=30.00,
                discount_pct=100.00,
                date=_future_date(4),
                slots=["9:00 PM", "10:00 PM", "11:00 PM"],
                max_group_size=6,
                total_spots=60,
                spots_remaining=60,
                expires_at=_expires(4),
            ),
        ]
    elif venue_category == "Pool Bar":
        deals += [
            dict(
                venue_id=venue_id,
                title="Day Pass + 2 Drinks",
                category="Entry",
                description="All-day pool access plus 2 cocktails of your choice.",
                unit="pp",
                original_price=65.00,
                discount_pct=30.00,
                date=_future_date(6),
                slots=["1:00 PM", "3:00 PM"],
                max_group_size=8,
                total_spots=40,
                spots_remaining=40,
                expires_at=_expires(6),
            ),
        ]

    # Compute deal_price for each
    for d in deals:
        d["deal_price"] = round(d["original_price"] * (1 - d["discount_pct"] / 100), 2)
        d["is_active"] = True
        d["id"] = _uid()

    return deals


def _make_confirmation_code() -> str:
    import string
    chars = string.ascii_uppercase + string.digits
    return "IMP-" + "".join(random.choices(chars, k=8))


# ── main seeder ───────────────────────────────────────────────────────────────

def seed(owner_id: str, wipe: bool = False) -> None:
    db = SessionLocal()
    try:
        # Verify the owner exists
        owner = db.query(User).filter(User.id == owner_id).first()
        if not owner:
            print(f"[ERROR] No user row found for id={owner_id}")
            print("  Sign in via the app first to trigger the user row creation,")
            print("  then run this script again.")
            return

        if wipe:
            print("[wipe] Removing previously seeded rows...")
            seeded_venues = (
                db.query(Venue).filter(Venue.owner_id == owner_id).all()
            )
            for v in seeded_venues:
                # cascade: deals → bookings, interactions
                for d in v.deals:
                    for b in d.bookings:
                        db.delete(b)
                    db.delete(d)
                for i in v.interactions:
                    db.delete(i)
                db.delete(v)
            db.commit()
            print(f"[wipe] Removed {len(seeded_venues)} venue(s) and their children.")

        print(f"[seed] Inserting {len(VENUES)} venues for owner {owner_id}...")

        all_venue_ids: list[str] = []
        all_deal_ids: list[str] = []

        for vdata in VENUES:
            vid = _uid()
            venue = Venue(id=vid, owner_id=owner_id, **vdata)
            db.add(venue)
            db.flush()  # get the id without committing
            all_venue_ids.append(vid)
            print(f"  + Venue: {vdata['name']}")

            deals = _deals_for_venue(vid, vdata["category"])
            for ddata in deals:
                deal = Deal(**ddata)
                db.add(deal)
                all_deal_ids.append(ddata["id"])
                print(f"      → Deal: {ddata['title']}")

        db.flush()

        # ── synthetic bookings (owner books their own deals for demo purposes) ──
        print("[seed] Creating sample bookings...")
        sample_deals = db.query(Deal).filter(Deal.id.in_(all_deal_ids)).limit(4).all()
        for deal in sample_deals:
            num_people = random.randint(2, 4)
            booking = Booking(
                id=_uid(),
                deal_id=deal.id,
                user_id=owner_id,
                slot_time=deal.slots[0],
                num_people=num_people,
                total_paid=round(float(deal.deal_price) * num_people, 2),
                confirmation_code=_make_confirmation_code(),
                status="confirmed",
            )
            db.add(booking)
            # decrement spots
            deal.spots_remaining = max(0, deal.spots_remaining - num_people)
            print(f"  + Booking: {deal.title} × {num_people} @ {deal.slots[0]}")

        # ── synthetic interactions ─────────────────────────────────────────────
        print("[seed] Creating sample interactions...")
        for vid in all_venue_ids:
            for event_type in ("view", "save"):
                interaction = UserVenueInteraction(
                    id=_uid(),
                    user_id=owner_id,
                    venue_id=vid,
                    event_type=event_type,
                    rating=None,
                )
                db.add(interaction)
        # add a couple of ratings
        for vid in random.sample(all_venue_ids, k=min(3, len(all_venue_ids))):
            db.add(UserVenueInteraction(
                id=_uid(),
                user_id=owner_id,
                venue_id=vid,
                event_type="rating",
                rating=random.randint(3, 5),
            ))

        db.commit()
        print(
            f"\n[seed] Done. Inserted {len(VENUES)} venues, "
            f"{len(all_deal_ids)} deals, "
            f"{min(4, len(all_deal_ids))} bookings."
        )

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the Impulse database with synthetic data.")
    parser.add_argument(
        "--owner-id",
        required=True,
        help="Supabase user UUID to own the seeded venues (must already exist in public.users).",
    )
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="Remove this user's existing venues/deals/bookings before re-seeding.",
    )
    args = parser.parse_args()
    seed(owner_id=args.owner_id, wipe=args.wipe)
