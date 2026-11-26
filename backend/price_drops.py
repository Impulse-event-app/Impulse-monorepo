"""
Falling discounts: a deal that starts at a bigger discount and steps down as
each time slot fills.

A deal's discount_pct is its opening discount. price_drops, when set, lists
the steps after it, e.g. [{"after": 5, "discount_pct": 25}, {"after": 10,
"discount_pct": 15}]: the 6th booking in a slot gets 25% off, the 11th 15%.
Each slot counts on its own, and a booking is one use whatever its group size.

A booking "uses" its slot once it holds spots (the initiator has paid), so an
abandoned checkout never pushes the next guest onto a worse price. The price
is still locked when the booking is created, so two guests checking out at the
same moment can both get the better step: the venue gives away a little, the
guest is never charged more than they were shown.
"""
from collections import Counter
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from deal_schedules import deal_price_for
from models import UNLIMITED_SPOTS, Booking

MAX_DROPS = 5


def check_drops(opening_pct: float, drops: Optional[List[dict]], total_spots: Optional[int] = None) -> Optional[List[dict]]:
    """Tidy and validate the steps: each starts after more bookings than the
    last and gives less off, and every step starts inside the deal's spots (a
    step after the last spot could never be reached). Raises ValueError with a
    message for the venue."""
    if not drops:
        return None
    if len(drops) > MAX_DROPS:
        raise ValueError(f"A deal can have at most {MAX_DROPS} price steps")
    out, last_after, last_pct = [], 0, float(opening_pct)
    for d in drops:
        after, pct = int(d["after"]), float(d["discount_pct"])
        if after <= last_after:
            raise ValueError("Each price step has to start after more bookings than the one before")
        if not (0 <= pct < last_pct):
            raise ValueError("Each price step has to give less off than the one before")
        out.append({"after": after, "discount_pct": pct})
        last_after, last_pct = after, pct
    if total_spots is not None and total_spots < UNLIMITED_SPOTS and last_after >= total_spots:
        raise ValueError(
            f"The early-bird steps add up to {last_after} bookings, but the deal has {total_spots} spots"
        )
    return out


def discount_after(opening_pct: float, drops: Optional[List[dict]], used: int) -> float:
    """The discount for the next booking in a slot that already has `used`."""
    pct = float(opening_pct)
    for d in drops or []:
        if used >= d["after"]:
            pct = float(d["discount_pct"])
    return pct


def left_at_price(drops: Optional[List[dict]], used: int) -> Optional[int]:
    """Bookings left in the slot before the next step, or None if there is none."""
    for d in drops or []:
        if used < d["after"]:
            return d["after"] - used
    return None


def slot_usage(db: Session, deal_ids: Iterable[str]) -> Dict[Tuple[str, str], int]:
    """(deal_id, slot_time) → bookings holding spots in that slot."""
    ids = list(set(deal_ids))
    if not ids:
        return {}
    rows = (
        db.query(Booking.deal_id, Booking.slot_time, func.count(Booking.id))
        .filter(Booking.deal_id.in_(ids), Booking.spots_held == True)
        .group_by(Booking.deal_id, Booking.slot_time)
        .all()
    )
    return Counter({(d, s): n for d, s, n in rows})


def slot_prices(deal, usage: Dict[Tuple[str, str], int]) -> List[dict]:
    """What the next booking in each slot pays."""
    out = []
    for slot in deal.slots or []:
        used = usage.get((deal.id, slot), 0)
        pct = discount_after(deal.discount_pct, deal.price_drops, used)
        out.append({
            "slot": slot,
            "discount_pct": pct,
            "deal_price": deal_price_for(deal.original_price, pct),
            "left_at_price": left_at_price(deal.price_drops, used),
        })
    return out


def current_price(db: Session, deal, slot: Optional[str]) -> float:
    """The price the next booking in `slot` locks. No steps: the deal's price."""
    if not deal.price_drops or not slot:
        return float(deal.deal_price)
    used = slot_usage(db, [deal.id]).get((deal.id, slot), 0)
    return deal_price_for(deal.original_price, discount_after(deal.discount_pct, deal.price_drops, used))


def best_price(deal, usage: Dict[Tuple[str, str], int]) -> float:
    """The cheapest price any slot is at now: what a feed card shows as 'from'."""
    if not deal.price_drops:
        return float(deal.deal_price)
    return min((p["deal_price"] for p in slot_prices(deal, usage)), default=float(deal.deal_price))
