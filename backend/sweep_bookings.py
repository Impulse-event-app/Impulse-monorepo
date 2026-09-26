"""
One-shot booking deadline sweep — expire Huddles that never finished voting,
collapse (and refund) Huddles that didn't all pay in time, and charge unpaid
direct-booking shares to their initiator. Safe to run repeatedly (idempotent).

Cron target, e.g. every 5 minutes:
    */5 * * * * cd /path/to/backend && uv run python sweep_bookings.py

The FastAPI app also runs this on a timer (see main.py), so an external cron is
only needed if you disable the in-app scheduler (HUDDLE_SWEEP_INTERVAL=0).
"""
from booking_flow import sweep_deadlines
from database import SessionLocal

if __name__ == "__main__":
    db = SessionLocal()
    try:
        result = sweep_deadlines(db)
        print(f"booking sweep: {result}")
    finally:
        db.close()
