"""App Review demo mode: who may see demo venues.

A demo venue (Venue.is_demo) exists so App Review can book end to end without
paying. Only demo accounts (User.is_demo) see it; everyone else, signed in or
not, never does. Its bookings never touch Stripe (payments.DEMO_PREFIX).
Set up with scripts/demo_mode.py.
"""
from typing import Optional

from sqlalchemy.orm import Query, Session

from models import User, Venue


def viewer_is_demo(db: Session, user: Optional[dict]) -> bool:
    if not user:
        return False
    return bool(db.query(User.is_demo).filter(User.id == user["sub"]).scalar())


def hide_demo_venues(q: Query, db: Session, user: Optional[dict]) -> Query:
    """Filter a query that already joins Venue: drop demo venues unless the
    viewer is a demo account."""
    if viewer_is_demo(db, user):
        return q
    return q.filter(Venue.is_demo == False)  # noqa: E712
