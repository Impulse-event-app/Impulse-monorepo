import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import SessionLocal
from routers import bookings, deals, huddles, interactions, users, venues, webhooks

logger = logging.getLogger("impulse.main")

# In-app huddle deadline sweeper. Runs every HUDDLE_SWEEP_INTERVAL seconds
# (default 60; set 0 to disable and rely on an external cron / sweep_huddles.py).
HUDDLE_SWEEP_INTERVAL = int(os.environ.get("HUDDLE_SWEEP_INTERVAL", "60"))


def _run_sweep_once() -> None:
    db = SessionLocal()
    try:
        result = huddles.sweep_deadlines(db)
        if any(result.values()):
            logger.info("Huddle sweep: %s", result)
    finally:
        db.close()


async def _sweep_loop() -> None:
    # Sleep first, so a short-lived process (tests, one-off boots) doesn't sweep.
    while True:
        await asyncio.sleep(HUDDLE_SWEEP_INTERVAL)
        try:
            await asyncio.to_thread(_run_sweep_once)
        except Exception as e:  # never let the sweeper kill the app
            logger.warning("Huddle sweep failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_sweep_loop()) if HUDDLE_SWEEP_INTERVAL > 0 else None
    try:
        yield
    finally:
        if task:
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
app.include_router(bookings.router,     prefix="/bookings",     tags=["bookings"])
app.include_router(interactions.router, prefix="/interactions", tags=["interactions"])
app.include_router(webhooks.router,     prefix="/webhooks",     tags=["webhooks"])
app.include_router(huddles.router,      prefix="/huddles",      tags=["huddles"])


@app.get("/health")
def health():
    return {"status": "ok"}
