"""
Give every venue a fresh deal for the coming evening(s), so the feed is never
full of expired drops while testing.

Each venue's newest deal is used as the template (title, prices, slots, group
size); the new copies get a real date and an expires_at at their last slot.
The venue's older active deals are switched off first, so only the fresh ones
show. A venue whose payment account hasn't cleared compliance gets its deal
created inactive, exactly as the API would.

Usage:
    uv run python refresh_deals.py --owner-id <uuid> [--days 1] [--dry-run]

    --owner-id   Only touch venues owned by this user (required)
    --days       How many evenings to create, starting with the next one (default 1)
    --dry-run    Print what would change without writing
"""

import argparse
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from database import SessionLocal
from models import Deal, Venue
from routers.merchants import can_publish_deals

SYDNEY = ZoneInfo("Australia/Sydney")
# After this hour, tonight's slots have mostly gone; start from tomorrow.
LAST_START_HOUR = 16


def _slot_at(day: datetime, slot: str) -> datetime:
    """'7:30pm' on `day`, in Sydney time."""
    t = datetime.strptime(slot.strip().upper().replace(" ", ""), "%I:%M%p")
    return day.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner-id", required=True)
    ap.add_argument("--days", type=int, default=1)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    now = datetime.now(SYDNEY)
    first = now if now.hour < LAST_START_HOUR else now + timedelta(days=1)
    days = [(first + timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0) for i in range(args.days)]

    db = SessionLocal()
    try:
        venues = db.query(Venue).filter(Venue.owner_id == args.owner_id, Venue.is_active == True).order_by(Venue.name).all()
        for v in venues:
            template = db.query(Deal).filter(Deal.venue_id == v.id).order_by(Deal.created_at.desc()).first()
            if not template:
                print(f"skip  {v.name}: no deal to copy")
                continue
            publish = can_publish_deals(v)

            stale = db.query(Deal).filter(Deal.venue_id == v.id, Deal.is_active == True).all()
            for d in stale:
                d.is_active = False

            for day in days:
                expires = _slot_at(day, template.slots[-1])
                label = "Tonight" if day.date() == now.date() else day.strftime("%A %-d %B %Y")
                db.add(Deal(
                    venue_id=v.id,
                    title=template.title,
                    category=template.category,
                    description=template.description,
                    unit=template.unit,
                    original_price=template.original_price,
                    discount_pct=template.discount_pct,
                    deal_price=round(template.original_price * (1 - template.discount_pct / 100), 2),
                    date=label,
                    slots=template.slots,
                    max_group_size=template.max_group_size,
                    total_spots=template.total_spots,
                    spots_remaining=template.total_spots,
                    is_active=publish,
                    expires_at=expires,
                ))
                print(f"{'add ' if publish else 'add (inactive: payments not cleared)'}  {v.name}: "
                      f"{template.title!r} · {label} · {', '.join(template.slots)} · ends {expires:%a %-d %b %-I:%M%p}")
            if stale:
                print(f"      {v.name}: switched off {len(stale)} older deal(s)")

        if args.dry_run:
            db.rollback()
            print("dry run: nothing written")
        else:
            db.commit()
            print("committed")
    finally:
        db.close()


if __name__ == "__main__":
    main()
