"""
One-shot huddle deadline sweep — expire/collapse huddles past their deadlines
and refund collapsed plans. Safe to run repeatedly (idempotent).

Cron target, e.g. every 5 minutes:
    */5 * * * * cd /path/to/backend && uv run python sweep_huddles.py

The FastAPI app also runs this on a timer (see main.py), so an external cron is
only needed if you disable the in-app scheduler (HUDDLE_SWEEP_INTERVAL=0).
"""
from database import SessionLocal
from routers.huddles import sweep_deadlines

if __name__ == "__main__":
    db = SessionLocal()
    try:
        result = sweep_deadlines(db)
        print(f"huddle sweep: {result}")
    finally:
        db.close()
