import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Request
from sqlalchemy import or_

import settlements
from database import SessionLocal
from mailer import MailNotConfigured, MailSendFailed, is_configured, send_email
from models import Booking, User, Venue
from pinch_client import PinchError

router = APIRouter()
logger = logging.getLogger("impulse.webhooks")

# Which merchant a transfer settled for. Every charge currently runs through
# the one Impulse merchant; once venues are managed merchants the event itself
# identifies the merchant and this becomes the fallback.
DEFAULT_MERCHANT_ID: str = os.environ["PINCH_TEST_MERCHANT_ID"]


def _process_transfer(payload: dict, data: dict) -> None:
    """A transfer means funds actually left Pinch for a bank account — the
    event a venue reads as "the money went in". The webhook only carries the
    id, so the detail is fetched and written to the settlements ledger."""
    transfer_id = data.get("id") or data.get("transferId") or payload.get("transferId")
    if not transfer_id or not str(transfer_id).startswith("tra_"):
        logger.warning("transfer webhook without a tra_ id: %s", json.dumps(payload))
        return

    merchant_id = (
        data.get("merchantId") or payload.get("merchantId")
        or data.get("currentMerchant") or DEFAULT_MERCHANT_ID
    )

    db = SessionLocal()
    try:
        settlement = settlements.ingest_transfer(db, str(transfer_id), str(merchant_id))
        logger.info(
            "Transfer %s ingested as settlement %s (%s, net %sc)",
            transfer_id, settlement.id, settlement.status, settlement.amount_cents,
        )
    except PinchError as e:
        # Leave it un-ingested rather than half-written; Pinch retries, and the
        # transfer can also be back-filled from List all transfers.
        db.rollback()
        logger.error("Failed to fetch transfer %s: %s %s", transfer_id, e.status_code, e.body)
    except Exception:
        db.rollback()
        logger.exception("Failed to ingest transfer %s", transfer_id)
    finally:
        db.close()


def _process_event(payload: dict) -> None:
    """Async webhook processing — runs after the 200 has been returned."""
    event_type = payload.get("event") or payload.get("type") or ""
    data = payload.get("data") or payload

    if event_type == "transfer":
        _process_transfer(payload, data)
        return
    if event_type != "realtime-payment":
        logger.info("Ignoring Pinch webhook event type %r", event_type)
        return

    payment_id = data.get("id")
    status = str(data.get("status", "")).lower()
    if not payment_id:
        logger.warning("realtime-payment webhook without a payment id: %s", json.dumps(payload))
        return

    db = SessionLocal()
    try:
        booking = (
            db.query(Booking)
            .filter(
                or_(
                    Booking.deposit_payment_id == payment_id,
                    Booking.balance_payment_id == payment_id,
                )
            )
            .first()
        )
        if not booking:
            logger.info("Pinch webhook for unknown payment %s — no matching booking", payment_id)
            return

        if status == "approved":
            if payment_id == booking.deposit_payment_id and booking.payment_status == "unpaid":
                booking.payment_status = "deposit_paid"
            elif payment_id == booking.balance_payment_id and booking.payment_status == "deposit_paid":
                booking.payment_status = "fully_paid"
            db.commit()
        logger.info(
            "Pinch webhook processed: payment %s status %s → booking %s payment_status %s",
            payment_id, status, booking.id, booking.payment_status,
        )
    finally:
        db.close()


@router.post("/pinch")
async def pinch_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Pinch event receiver. Always returns 200 immediately; processing is async.
    Every payload is logged in full.
    """
    try:
        payload = await request.json()
    except Exception:
        raw = (await request.body()).decode(errors="replace")
        logger.warning("Pinch webhook with non-JSON body: %s", raw)
        return {"received": True}

    logger.info("Pinch webhook payload: %s", json.dumps(payload))
    background_tasks.add_task(_process_event, payload)
    return {"received": True}


# ── Compliance (managed merchant onboarding) ─────────────────────────────────
#
# The compliance-updated payload carries no merchant id, only a submission id, so
# the venue cannot be recovered from the body. Each managed merchant is instead
# registered with its own webhook uri ending in that venue's id, and its own
# whsec_ signing secret, so the URL identifies the venue and the signature proves
# the caller is Pinch.

# Pinch's .NET SDK uses five minutes; matching it bounds replay of a captured POST.
_SIGNATURE_TOLERANCE_SECONDS = 300


def _verify_signature(header: str, raw_body: bytes, secret: str) -> bool:
    """Check `pinch-signature: t=<unix>,v2=<hmac>` against HMAC-SHA256 of
    "{t}.{raw body}". Compared with compare_digest so a wrong signature cannot be
    recovered a byte at a time by timing the response."""
    if not header or not secret:
        return False
    parts = dict(
        piece.split("=", 1) for piece in header.split(",") if "=" in piece
    )
    timestamp, provided = parts.get("t", "").strip(), parts.get("v2", "").strip()
    if not timestamp or not provided:
        return False
    try:
        if abs(time.time() - int(timestamp)) > _SIGNATURE_TOLERANCE_SECONDS:
            return False
    except ValueError:
        return False
    expected = hmac.new(
        secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, provided)


def _get(data: dict, *names):
    """Pinch delivers PascalCase by default and camelCase when asked, and the two
    are mixed across their docs — so read a key by any of its spellings."""
    for name in names:
        if name in data:
            return data[name]
    return None


# Only these two are worth an email. pending/in-progress/in-review are noise —
# the venue already knows they submitted, and the page shows live status.
_NOTIFIABLE_STATUSES = ("approved", "rejected")


def _notify_compliance_outcome(db, venue: Venue, status: str, notes) -> None:
    """Tell the venue their verification finished.

    Deliberately best-effort: a failed send must not fail the webhook, or Pinch
    retries an update we have already applied. Unlike a venue enquiry there is
    nothing lost by a missed email — the status is on the page either way — so
    this logs and moves on rather than raising the way contact.py does.
    """
    if status not in _NOTIFIABLE_STATUSES:
        return

    owner = db.query(User).filter(User.id == venue.owner_id).first()
    recipient = (owner.email if owner else None) or venue.email
    if not recipient:
        logger.warning("No email on file for venue %s; compliance outcome not sent", venue.id)
        return
    if not is_configured():
        logger.warning("SMTP not configured; compliance outcome for venue %s not sent", venue.id)
        return

    if status == "approved":
        subject = f"{venue.name} is verified — you can publish deals"
        body = (
            f"Good news — Pinch has verified {venue.name}.\n\n"
            "Your deals can now go live, and takings will settle to your own "
            "bank account.\n\n"
            "Publish a deal: https://impulseapp.au/dashboard/deals\n"
        )
    else:
        detail = f"\n\nWhat they said:\n{notes}\n" if notes else "\n"
        body = (
            f"Pinch could not verify {venue.name} yet.{detail}\n"
            "This is usually a document that needs re-taking — most often a "
            "licence photographed in black and white, or only one side of it.\n\n"
            "Upload a replacement here: "
            "https://impulseapp.au/dashboard/payments-setup\n"
        )
        subject = f"Action needed to verify {venue.name}"

    try:
        send_email([recipient], subject, body)
        logger.info("Compliance outcome (%s) emailed for venue %s", status, venue.id)
    except (MailNotConfigured, MailSendFailed, ValueError) as e:
        logger.error("Compliance outcome email failed for venue %s: %s", venue.id, e)


def _process_compliance(venue_id: str, payload: dict) -> None:
    """Write the new compliance state. Runs after the 200 has been returned."""
    data = _get(payload, "Data", "data") or {}
    submission = _get(data, "ComplianceSubmission", "complianceSubmission") or {}
    metadata = _get(payload, "Metadata", "metadata") or {}

    submission_status = (_get(submission, "SubmissionStatus", "submissionStatus")
                         or _get(metadata, "Status", "status"))
    merchant_status = (_get(submission, "MerchantStatus", "merchantStatus")
                       or _get(metadata, "MerchantStatus", "merchantStatus"))
    notes = _get(submission, "Notes", "notes")

    db = SessionLocal()
    try:
        venue = db.query(Venue).filter(Venue.id == venue_id).first()
        if not venue:
            logger.warning("Compliance webhook for unknown venue %s", venue_id)
            return
        previous_status = venue.pinch_submission_status
        if submission_status:
            venue.pinch_submission_status = str(submission_status)
        if merchant_status:
            venue.pinch_merchant_status = str(merchant_status)
        if notes:
            venue.pinch_compliance_notes = str(notes)
        venue.pinch_compliance_updated_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Compliance updated for venue %s: submission=%s merchant=%s",
                    venue_id, submission_status, merchant_status)

        # Only on a real transition — Pinch emits compliance-updated on every
        # document upload too, and nobody needs an email for each one.
        if submission_status and str(submission_status) != previous_status:
            _notify_compliance_outcome(db, venue, str(submission_status), notes)
    except Exception:
        db.rollback()
        logger.exception("Failed to apply compliance update for venue %s", venue_id)
    finally:
        db.close()


@router.post("/pinch/compliance/{venue_id}")
async def pinch_compliance_webhook(
    venue_id: str, request: Request, background_tasks: BackgroundTasks
):
    """
    compliance-updated receiver for one managed merchant.

    Always answers 200, including when the signature fails — a 401 would tell an
    attacker probing the endpoint whether a guess was close. The payload carries
    only statuses and reviewer notes (no document contents and no ID numbers), so
    logging it in full is safe and matches the existing handler.
    """
    raw = await request.body()

    db = SessionLocal()
    try:
        venue = db.query(Venue).filter(Venue.id == venue_id).first()
        secret = venue.pinch_webhook_secret if venue else None
    finally:
        db.close()

    if not _verify_signature(request.headers.get("pinch-signature", ""), raw, secret or ""):
        logger.warning("Rejected compliance webhook for venue %s: bad or missing signature", venue_id)
        return {"received": True}

    try:
        payload = json.loads(raw)
    except Exception:
        logger.warning("Compliance webhook for venue %s with non-JSON body", venue_id)
        return {"received": True}

    logger.info("Compliance webhook payload for venue %s: %s", venue_id, json.dumps(payload))
    background_tasks.add_task(_process_compliance, venue_id, payload)
    return {"received": True}
