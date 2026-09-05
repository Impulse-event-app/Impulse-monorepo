"""Landing-page contact forms. Public, unauthenticated, and they send mail — so
only two things really matter here: a real enquiry always reaches a human, and a
bot cannot turn the endpoint into an open mail relay.

Nothing is written to the database. The email IS the record, which is why a
failed send comes back as a 502 rather than being swallowed: the form then tells
the venue to email us directly instead of pretending it went. The full enquiry is
logged at ERROR on that path too, so a misconfigured mailer costs a copy-and-paste
out of the logs rather than a lost lead.
"""
import logging
import os
import time
from typing import Dict, List

from fastapi import APIRouter, HTTPException, Request

from mailer import MailNotConfigured, MailSendFailed, send_email
from schemas import VenueEnquiryCreate

router = APIRouter()
logger = logging.getLogger("impulse.contact")

# Who gets a venue enquiry. Overridable so staging can send to a test inbox.
VENUE_ENQUIRY_TO: List[str] = [
    a.strip()
    for a in os.environ.get(
        "VENUE_ENQUIRY_TO", "rahul@impulseapp.au,manoj@impulseapp.au"
    ).split(",")
    if a.strip()
]

# Per-IP throttle. In-process and therefore per-worker, which is the wrong shape
# for a real limiter but exactly right for this: it costs nothing, needs no
# store, and a form nobody has heard of yet does not warrant Redis.
_RATE_LIMIT = int(os.environ.get("CONTACT_RATE_LIMIT", "5"))
_RATE_WINDOW = 3600.0
_recent: Dict[str, List[float]] = {}


def _client_ip(request: Request) -> str:
    # Render (and every other proxy) puts the real address at the head of
    # X-Forwarded-For; request.client is the proxy itself.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limited(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _recent.get(ip, []) if now - t < _RATE_WINDOW]
    if hits:
        _recent[ip] = hits
    else:
        # Drop empty buckets, or a long-running process accumulates one key for
        # every address that has ever touched the endpoint.
        _recent.pop(ip, None)
    if len(hits) >= _RATE_LIMIT:
        return True
    _recent.setdefault(ip, []).append(now)
    return False


@router.post("/venue", status_code=202)
def venue_enquiry(payload: VenueEnquiryCreate, request: Request):
    """A venue asking about a pilot. Emails VENUE_ENQUIRY_TO; stores nothing."""
    if payload.website:
        # Honeypot tripped. Answer 202 anyway — a bot that can tell rejection
        # from acceptance is a bot that can iterate until it gets through.
        logger.info("Venue enquiry dropped: honeypot filled")
        return {"status": "sent"}

    ip = _client_ip(request)
    if _rate_limited(ip):
        raise HTTPException(
            status_code=429,
            detail="That's a few enquiries in a row — give it an hour, or email us directly.",
        )

    lines = [
        f"Venue:   {payload.venue}",
        f"Contact: {payload.name}",
        f"Email:   {payload.email}",
    ]
    if payload.phone:
        lines.append(f"Phone:   {payload.phone}")
    if payload.message:
        lines += ["", payload.message]
    lines += ["", f"— sent from the impulseapp.au landing page ({ip})"]
    body = "\n".join(lines)
    subject = f"Venue enquiry — {payload.venue}"

    try:
        send_email(VENUE_ENQUIRY_TO, subject, body, reply_to=payload.email)
    except (MailNotConfigured, MailSendFailed) as e:
        # Log the whole thing: the enquiry is recoverable from here even though
        # the send is not.
        logger.error("Venue enquiry NOT sent (%s):\n%s", e, body)
        raise HTTPException(
            status_code=502,
            detail="We couldn't send that just now.",
        )

    return {"status": "sent"}
