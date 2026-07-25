import json
import logging

from fastapi import APIRouter, BackgroundTasks, Request
from sqlalchemy import or_

from database import SessionLocal
from models import Booking

router = APIRouter()
logger = logging.getLogger("impulse.webhooks")


def _process_event(payload: dict) -> None:
    """Async webhook processing — runs after the 200 has been returned."""
    event_type = payload.get("event") or payload.get("type") or ""
    data = payload.get("data") or payload

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
