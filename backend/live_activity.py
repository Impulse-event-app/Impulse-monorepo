"""
iOS Live Activities for group bookings — the Lock Screen / Dynamic Island
card that shows "3 of 4 paid · closes in 42m" while shares come in. Only
the person who booked (the Huddle's creator) gets one: they're the one
chasing the group. Everyone else gets a time-sensitive push with what they
owe (push_invite / push_shares) and is done once they've paid. Once
everyone's paid there's nothing left to chase, so the card ends there: a
final "Everyone's paid. Show code … at the door" on the Lock Screen that
dismisses itself, and nothing in the Dynamic Island.

The app starts the activity itself (from the same `live_activity` props the
booking view carries) and registers its push token; from then on every
booking change reaches it from here. booking_flow.touch() marks the booking,
and after the commit lands the change is pushed on a background worker, so a
request never waits on APNs. Without the APNS_* env vars nothing is queued.
"""
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

import apns
import booking_flow as flow
from booking_logic import VENUE_TZ, slot_at
from database import SessionLocal
from models import Booking, BookingParticipant, LiveActivityToken

logger = logging.getLogger("impulse.live_activity")

# Must match createLiveActivity('booking', …) in the app.
ACTIVITY_NAME = "booking"
# The card runs while shares are being collected; it ends when the booking
# confirms or finishes any other way.
SHOWN = ("collecting", "confirmed")
ENDED_NOTE = {
    "redeemed": "Enjoy! Code redeemed",
    "cancelled": "This plan was cancelled",
    "expired": "This plan expired",
    "collapsed": "Not everyone paid in time. You've been refunded",
}
# How long an ended card stays on the Lock Screen.
DISMISS_AFTER = 15 * 60

# One worker: pushes for a booking go out in the order its commits landed.
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="live-activity")


def _ms(dt) -> int:
    return int(dt.timestamp() * 1000) if dt else 0


def eligible(b: Booking) -> bool:
    """Group bookings only, once there's a deal and a price — not the voting stage."""
    return len(b.participants) > 1 and b.deal is not None


def content_props(b: Booking, p: BookingParticipant) -> dict:
    """What the card shows for one person. The app starts the activity with
    these exact props, so the backend's updates have the same shape."""
    seats = flow.share_order(b)
    deal = b.deal
    when = slot_at(deal.date, b.slot_time) if deal and b.slot_time else None
    i_paid = p.deposit_status in flow.DEPOSIT_DONE or p.covered_by_member_id is not None
    phase = "collecting" if b.status == "collecting" else "ended"
    note = ENDED_NOTE.get(b.status, "")
    if b.status == "confirmed":
        note = f"Everyone's paid. Show code {b.confirmation_code} at the door"
    return {
        "bookingId": b.id,
        "venue": deal.venue.name if deal and deal.venue else "Your plan",
        "slot": f"{when.astimezone(VENUE_TZ):%a} {b.slot_time}" if when else (b.slot_time or ""),
        "phase": phase,
        "paid": sum(1 for s in seats if s.deposit_status in flow.DEPOSIT_DONE),
        "total": len(seats),
        "deadlineAt": _ms(b.share_deadline),
        "slotAt": _ms(when),
        "myShareCents": 0 if p.covered_by_member_id else (p.share_amount_cents or 0),
        "iPaid": i_paid,
        "note": note,
    }


def has_card(b: Booking, p: Optional[BookingParticipant]) -> bool:
    return p is not None and p.id == b.initiator_member_id and eligible(b)


def view_props(b: Booking, me: Optional[BookingParticipant]) -> Optional[dict]:
    """The props for the booking view, or None when this person shouldn't
    have a card (not the person who booked, solo, voting stage, finished).
    A just-confirmed booking still returns props (phase "ended") so the app
    can end its card with the final message."""
    if not has_card(b, me) or b.status not in SHOWN:
        return None
    return content_props(b, me)


def payload(b: Booking, p: BookingParticipant, now: Optional[float] = None) -> dict:
    now = time.time() if now is None else now
    props = content_props(b, p)
    aps = {
        "timestamp": int(now),
        "event": "update" if props["phase"] != "ended" else "end",
        "content-state": {"name": ACTIVITY_NAME, "props": json.dumps(props, separators=(",", ":"))},
    }
    if aps["event"] == "end":
        aps["dismissal-date"] = int(now) + DISMISS_AFTER
    return {"aps": aps}


def priority(b: Booking) -> int:
    """10 (immediate) for the final "end"; 5 (power-friendly, may be
    batched) for routine "3 of 4 paid" updates."""
    return 5 if b.status == "collecting" else 10


def sync(db: Session, booking_id: str) -> int:
    """Push the booking's current state to every running Live Activity on it.
    Returns how many were sent. Dead tokens are dropped; a finished booking's
    tokens are dropped after its final "end" push."""
    tokens = db.query(LiveActivityToken).filter(LiveActivityToken.booking_id == booking_id).all()
    if not tokens:
        return 0
    try:
        b = flow.load(db, booking_id)
    except HTTPException:
        return 0
    members = {p.id: p for p in b.participants}
    sent = 0
    for t in tokens:
        p = members.get(t.member_id)
        if p is None or p.user_id is None or not has_card(b, p):   # no longer theirs to show
            db.delete(t)
            continue
        msg = payload(b, p)
        result, env = apns.send_live_activity(t.push_token, t.environment, msg, priority(b))
        if result == apns.OK:
            sent += 1
        if env != t.environment:
            t.environment = env
        if result == apns.DEAD or msg["aps"]["event"] == "end":
            db.delete(t)
    db.commit()
    return sent


def _run(booking_id: str) -> None:
    db = SessionLocal()
    try:
        sync(db, booking_id)
    except Exception as e:     # a dead push must never surface anywhere
        logger.warning("Live activity sync failed for %s: %s", booking_id, e)
    finally:
        db.close()


def enqueue(booking_ids: Iterable[str]) -> None:
    if not apns.configured():
        return
    for booking_id in booking_ids:
        _pool.submit(_run, booking_id)


def register(db: Session, b: Booking, me: BookingParticipant, push_token: str) -> None:
    """Upsert the token for my activity on this booking (a token belongs to
    one activity, so a re-sent token just moves to the latest row)."""
    row = db.query(LiveActivityToken).filter(LiveActivityToken.push_token == push_token).first()
    if row is None:
        row = LiveActivityToken(push_token=push_token)
        db.add(row)
    row.booking_id = b.id
    row.member_id = me.id
    db.commit()


def unregister(db: Session, b: Booking, me: BookingParticipant) -> None:
    db.query(LiveActivityToken).filter(
        LiveActivityToken.booking_id == b.id, LiveActivityToken.member_id == me.id,
    ).delete()
    db.commit()
