from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import bookings, deals, interactions, users, venues, webhooks

app = FastAPI(title="Impulse API", version="1.0.0")

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


@app.get("/health")
def health():
    return {"status": "ok"}
