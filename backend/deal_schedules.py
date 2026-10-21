"""
Weekly deal schedules → real deals.

A venue sets up a DealSchedule ("Two games + shoes, Tue/Thu/Sat, 6pm–9pm").
On each scheduled evening the generator creates an ordinary Deal for that day,
so the feed, bookings and payouts never need to know about schedules.

Only today's (Sydney) evening is generated: the app treats every deal in the
feed as tonight's. The unique index on (schedule_id, deal_date) makes this safe
to run from several processes at once (local + Render share the live DB).
"""
import logging
from datetime import date, datetime, time, timedelta
from typing import Iterable, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from booking_logic import VENUE_TZ as SYDNEY
from models import Deal, DealSchedule, Venue

logger = logging.getLogger("impulse.schedules")


def parse_slot(slot: str) -> time:
    """'7:30pm', '7:30 PM' or '7pm' → time(19, 30). Raises ValueError otherwise."""
    s = slot.strip().upper().replace(" ", "")
    for fmt in ("%I:%M%p", "%I%p"):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            pass
    raise ValueError(f"Can't read the time slot {slot!r}. Use a time like 6:30pm.")


def normalize_slot(slot: str) -> str:
    """'7pm' → '7:00 PM': the shape booking deadlines parse (parse_slot_datetime)."""
    t = parse_slot(slot)
    return f"{t.hour % 12 or 12}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"


def date_label(day: date) -> str:
    """The display string stored in Deal.date, e.g. 'Tuesday 3 November 2026'."""
    return f"{day:%A} {day.day} {day:%B %Y}"


def expires_for(day: date, slots: Iterable[str]) -> datetime:
    """A deal ends at its latest slot on its evening, in Sydney time."""
    last = max(parse_slot(s) for s in slots)
    return datetime.combine(day, last, tzinfo=SYDNEY)


def runs_on(schedule: DealSchedule, day: date) -> bool:
    if day.weekday() not in (schedule.weekdays or []):
        return False
    if schedule.starts_on and day < schedule.starts_on:
        return False
    if schedule.ends_on and day > schedule.ends_on:
        return False
    return True


def deal_from_schedule(schedule: DealSchedule, day: date) -> Deal:
    original = float(schedule.original_price)
    discount = float(schedule.discount_pct)
    return Deal(
        venue_id=schedule.venue_id,
        schedule_id=schedule.id,
        title=schedule.title,
        category=schedule.category,
        description=schedule.description,
        unit=schedule.unit,
        original_price=original,
        discount_pct=discount,
        deal_price=round(original * (1 - discount / 100), 2),
        date=date_label(day),
        deal_date=day,
        slots=list(schedule.slots),
        max_group_size=schedule.max_group_size,
        total_spots=schedule.total_spots,
        spots_remaining=schedule.total_spots,
        is_active=True,
        expires_at=expires_for(day, schedule.slots),
    )


def generate_scheduled_deals(
    db: Session, now: Optional[datetime] = None, venue_id: Optional[str] = None,
) -> List[Deal]:
    """Create tonight's deal for every active schedule that runs today and
    hasn't made it yet. Skips evenings whose last slot has passed, and venues
    that can't take deposits yet. Commits each deal on its own."""
    from routers.merchants import can_publish_deals  # routers import this module

    now = now or datetime.now(SYDNEY)
    today = now.astimezone(SYDNEY).date()

    q = (
        db.query(DealSchedule)
        .join(Venue, DealSchedule.venue_id == Venue.id)
        .filter(DealSchedule.is_active == True, Venue.is_active == True)
    )
    if venue_id:
        q = q.filter(DealSchedule.venue_id == venue_id)

    created: List[Deal] = []
    for schedule in q.all():
        if not runs_on(schedule, today) or expires_for(today, schedule.slots) <= now:
            continue
        exists = (
            db.query(Deal.id)
            .filter(Deal.schedule_id == schedule.id, Deal.deal_date == today)
            .first()
        )
        if exists:
            continue
        venue = db.query(Venue).filter(Venue.id == schedule.venue_id).first()
        if not can_publish_deals(venue):
            continue
        deal = deal_from_schedule(schedule, today)
        try:
            with db.begin_nested():
                db.add(deal)
            db.commit()
        except IntegrityError:
            db.rollback()  # another process made it first
            continue
        created.append(deal)
        logger.info("Scheduled deal: %s · %s · %s", venue.name, schedule.title, deal.date)
    return created
