"""Stripe webhook receivers.

Three endpoints, one per Stripe event destination, each with its own signing
secret:

  POST /webhooks/stripe           platform events (snapshot): a hold finished
                                  confirming, a payment failed, a dispute opened
  POST /webhooks/stripe/connect   connected-account events (snapshot): a venue's
                                  payout arrived or failed
  POST /webhooks/stripe/accounts  Accounts v2 events (thin): a venue's
                                  capabilities or requirements changed

A bad signature is a 400, as Stripe expects. Processing runs after the 2xx so
Stripe never retries an event we have already applied.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

import booking_flow as flow
import stripe_client
from database import SessionLocal
from mailer import MailNotConfigured, MailSendFailed, is_configured, send_email
from models import Booking, User, Venue

router = APIRouter()
logger = logging.getLogger("impulse.webhooks")


async def _verified_event(request: Request, secret: str) -> dict:
    if not secret:
        logger.error("Stripe webhook received but its signing secret is not configured")
        raise HTTPException(status_code=400, detail="Webhook not configured")
    raw = await request.body()
    try:
        return stripe_client.construct_event(raw, request.headers.get("stripe-signature", ""), secret)
    except (stripe_client.SignatureVerificationError, ValueError):
        logger.warning("Rejected Stripe webhook: bad or missing signature")
        raise HTTPException(status_code=400, detail="Invalid signature")


# ── Platform events ──────────────────────────────────────────────────────────

def _process_platform(event: dict) -> None:
    kind = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}
    if kind in ("payment_intent.amount_capturable_updated", "setup_intent.succeeded"):
        db = SessionLocal()
        try:
            flow.confirm_hold_from_webhook(db, obj.get("id"))
        except Exception:
            db.rollback()
            logger.exception("Finalising %s from webhook failed", obj.get("id"))
        finally:
            db.close()
    elif kind == "payment_intent.payment_failed":
        err = obj.get("last_payment_error") or {}
        logger.info("Payment %s failed: %s (%s)", obj.get("id"), err.get("message"), err.get("decline_code"))
    elif kind == "charge.dispute.created":
        # Impulse is liable for disputes on destination charges. A human handles
        # these; the log line is the alert until there's a dashboard for it.
        logger.error("DISPUTE opened: %s on charge %s for %s cents (reason %s) — respond in the Stripe Dashboard",
                     obj.get("id"), obj.get("charge"), obj.get("amount"), obj.get("reason"))
    else:
        logger.info("Ignoring Stripe event %s", kind)


@router.post("/stripe")
async def stripe_webhook(request: Request, background_tasks: BackgroundTasks):
    event = await _verified_event(request, stripe_client.STRIPE_WEBHOOK_SECRET)
    background_tasks.add_task(_process_platform, event)
    return {"received": True}


# ── Connected-account events (payouts) ───────────────────────────────────────

def _process_connect(event: dict) -> None:
    kind = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}
    if kind not in ("payout.paid", "payout.failed", "payout.canceled"):
        logger.info("Ignoring connected-account event %s", kind)
        return
    db = SessionLocal()
    try:
        b = db.query(Booking).filter(Booking.stripe_payout_id == obj.get("id")).first()
        if not b:
            # An instant payout can land before payouts.pay_out_booking has
            # committed its id, so fall back to the booking id it stamped into
            # the payout's metadata.
            booking_id = (obj.get("metadata") or {}).get("impulseBookingId")
            b = db.get(Booking, booking_id) if booking_id else None
            if b and not b.stripe_payout_id:
                b.stripe_payout_id = obj.get("id")
        if b:
            b.payout_status = {"payout.paid": "paid"}.get(kind, "failed")
            db.commit()
        log = logger.info if kind == "payout.paid" else logger.error
        log("Payout %s on %s: %s (%s cents)", obj.get("id"), event.get("account"), kind, obj.get("amount"))
    finally:
        db.close()


@router.post("/stripe/connect")
async def stripe_connect_webhook(request: Request, background_tasks: BackgroundTasks):
    event = await _verified_event(request, stripe_client.STRIPE_CONNECT_WEBHOOK_SECRET)
    background_tasks.add_task(_process_connect, event)
    return {"received": True}


# ── Accounts v2 events (venue verification) ──────────────────────────────────

def _notify_status_change(db, venue: Venue, previous: str) -> None:
    """Tell the venue when it can take payments, or when Stripe needs more.

    Best-effort: a failed send must not fail the webhook. The status is on the
    Payments page either way."""
    current = venue.stripe_transfers_status
    if current == previous or current not in ("active", "restricted"):
        return
    owner = db.query(User).filter(User.id == venue.owner_id).first()
    recipient = (owner.email if owner else None) or venue.email
    if not recipient or not is_configured():
        logger.warning("Status email for venue %s not sent (no recipient or SMTP unset)", venue.id)
        return
    if current == "active":
        subject = f"{venue.name} is verified — you can publish deals"
        body = (
            f"Good news — Stripe has verified {venue.name}.\n\n"
            "Your deals can now go live, and each booking is paid to your bank "
            "within minutes of you checking the group in.\n\n"
            "Publish a deal: https://impulseapp.au/dashboard/deals\n"
        )
    else:
        due = "\n".join(f"- {d.get('description')}" for d in (venue.stripe_requirements or []) if d.get("description"))
        body = (
            f"Stripe needs a little more information to keep payments running for {venue.name}."
            f"{chr(10) * 2 + due if due else ''}\n\n"
            "Finish it here: https://impulseapp.au/dashboard/payments-setup\n"
        )
        subject = f"Action needed for {venue.name}'s payments"
    try:
        send_email([recipient], subject, body)
    except (MailNotConfigured, MailSendFailed, ValueError) as e:
        logger.error("Status email for venue %s failed: %s", venue.id, e)


def _process_account(account_id: str) -> None:
    from routers.merchants import sync_account
    db = SessionLocal()
    try:
        venue = db.query(Venue).filter(Venue.stripe_account_id == account_id).first()
        if not venue:
            logger.warning("Account event for unknown account %s", account_id)
            return
        previous = venue.stripe_transfers_status
        sync_account(db, venue)
        _notify_status_change(db, venue, previous)
    except Exception:
        db.rollback()
        logger.exception("Applying account update for %s failed", account_id)
    finally:
        db.close()


@router.post("/stripe/accounts")
async def stripe_accounts_webhook(request: Request, background_tasks: BackgroundTasks):
    secret = stripe_client.STRIPE_ACCOUNTS_WEBHOOK_SECRET
    if not secret:
        raise HTTPException(status_code=400, detail="Webhook not configured")
    raw = await request.body()
    try:
        notification = stripe_client.parse_thin_event(raw, request.headers.get("stripe-signature", ""), secret)
    except (stripe_client.SignatureVerificationError, ValueError):
        logger.warning("Rejected Stripe accounts webhook: bad or missing signature")
        raise HTTPException(status_code=400, detail="Invalid signature")
    related = getattr(notification, "related_object", None)
    # Only account events matter here. A destination subscribed to more (or
    # `stripe listen --all-thin` locally) also delivers thin events about
    # payments, charges and payouts, whose related object isn't an account.
    if related and getattr(related, "type", None) == "v2.core.account" and getattr(related, "id", None):
        background_tasks.add_task(_process_account, related.id)
    else:
        logger.debug("Ignoring thin event %s", getattr(notification, "type", None))
    return {"received": True}
