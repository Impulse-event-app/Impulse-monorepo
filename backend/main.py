import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import booking_flow
from database import SessionLocal
from deal_schedules import generate_scheduled_deals
from routers import (
    bookings, contact, deals, huddles, interactions, merchants, reels, schedules, users, venues,
    waitlist, webhooks,
)

# Show the app's own INFO logs (push sends, sweeps) — Python's default root
# level is WARNING, which hid them in Render's log stream.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("impulse.main")

# In-app booking deadline sweeper (Huddle voting/collapse + direct-booking guarantor). Runs every HUDDLE_SWEEP_INTERVAL seconds
# (default 60; set 0 to disable and rely on an external cron / sweep_bookings.py).
HUDDLE_SWEEP_INTERVAL = int(os.environ.get("HUDDLE_SWEEP_INTERVAL", "60"))

# Weekly deal schedules → tonight's deals. Runs every SCHEDULED_DEALS_INTERVAL seconds (default 900; 0 disables).
# Safe in several processes at once: a unique index allows one deal per schedule per evening.
SCHEDULED_DEALS_INTERVAL = int(os.environ.get("SCHEDULED_DEALS_INTERVAL", "900"))


def _run_sweep_once() -> None:
    db = SessionLocal()
    try:
        result = booking_flow.sweep_deadlines(db)
        if any(result.values()):
            logger.info("Booking deadline sweep: %s", result)
    finally:
        db.close()


async def _sweep_loop() -> None:
    # Sleep first, so a short-lived process (tests, one-off boots) doesn't sweep.
    while True:
        await asyncio.sleep(HUDDLE_SWEEP_INTERVAL)
        try:
            await asyncio.to_thread(_run_sweep_once)
        except Exception as e:  # never let the sweeper kill the app
            logger.warning("Booking deadline sweep failed: %s", e)


def _run_schedules_once() -> None:
    db = SessionLocal()
    try:
        generate_scheduled_deals(db)
    finally:
        db.close()


async def _schedules_loop() -> None:
    # Sleep first, like the sweep, so short-lived processes don't write. Short
    # enough that an instance waking from sleep catches up soon.
    while True:
        await asyncio.sleep(SCHEDULED_DEALS_INTERVAL)
        try:
            await asyncio.to_thread(_run_schedules_once)
        except Exception as e:  # never let the generator kill the app
            logger.warning("Scheduled deals run failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = []
    if HUDDLE_SWEEP_INTERVAL > 0:
        tasks.append(asyncio.create_task(_sweep_loop()))
    if SCHEDULED_DEALS_INTERVAL > 0:
        tasks.append(asyncio.create_task(_schedules_loop()))
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()


app = FastAPI(title="Impulse API", version="1.0.0", lifespan=lifespan)

# Allow the mobile app (and any future web dashboard) to call the API.
# In production, replace "*" with your actual domain(s).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router,        prefix="/users",        tags=["users"])
app.include_router(venues.router,       prefix="/venues",       tags=["venues"])
app.include_router(deals.router,        prefix="/deals",        tags=["deals"])
app.include_router(schedules.router,    prefix="/deal-schedules", tags=["deal-schedules"])
app.include_router(reels.router,        prefix="/reels",        tags=["reels"])
app.include_router(bookings.router,     prefix="/bookings",     tags=["bookings"])
app.include_router(interactions.router, prefix="/interactions", tags=["interactions"])
app.include_router(merchants.router,    prefix="/merchants",    tags=["merchants"])
app.include_router(webhooks.router,     prefix="/webhooks",     tags=["webhooks"])
app.include_router(huddles.router,      prefix="/huddles",      tags=["huddles"])
app.include_router(waitlist.router,     prefix="/api/waitlist", tags=["waitlist"])
app.include_router(contact.router,      prefix="/api/contact",  tags=["contact"])


@app.get("/health")
def health():
    return {"status": "ok"}
