import json
import logging
import os

from fastapi import APIRouter, BackgroundTasks, Request
from sqlalchemy import or_

import settlements
from database import SessionLocal
from models import Booking
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
