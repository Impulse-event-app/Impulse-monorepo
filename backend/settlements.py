"""Ingest Pinch transfers into the settlements ledger.

A transfer is Pinch actually sending money to a bank account. That is the
event a venue means by "the payment went in" — an approved payment only says
the card worked, and can still be days away from the bank.

Shape of the ingest:
  transfer webhook → GET /transfers/{id} → GET /transfers/items/{id}
                   → resolve each line back to a booking → settlement + lines

Resolving a line back to a booking has two paths because Pinch's line `id` is
not documented as being the payment id. We try it as one anyway, then fall
back to the `metadata` string — which is the exact string payments.py wrote,
so it still carries impulseBookingId. The fallback is the reliable path; the
id match is the cheap one.

Money the venue is owed is computed from our own booking ledger rather than
read off Pinch. Pinch reports gross and its own fees, but how the Impulse
application fee splits is our rule, so deriving it here keeps the venue-facing
number right no matter how Pinch chooses to report platform fees.
"""
import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

import pinch_client
from models import Booking, Deal, Settlement, SettlementLine
from payments import BALANCE_APPLICATION_FEE_RATE

logger = logging.getLogger("impulse.settlements")


def _parse_dt(value) -> Optional[datetime]:
    """Pinch sends ISO 8601; tolerate a trailing Z and anything unparseable."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        logger.warning("Unparseable transfer date %r", value)
        return None


def _parse_metadata(raw) -> dict:
    """Line metadata comes back as a JSON *string* (see payments.py)."""
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


def _resolve_booking(db: Session, line: dict) -> tuple[Optional[Booking], Optional[str], Optional[str]]:
    """Map a transfer line to (booking, kind, payment_id).

    kind is "deposit" or "balance" — which of the two charges on that booking
    this line settles.
    """
    meta = _parse_metadata(line.get("metadata"))
    booking_id = meta.get("impulseBookingId")
    kind = meta.get("type") if meta.get("type") in ("deposit", "balance") else None

    if booking_id:
        booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if booking:
            payment_id = (
                booking.deposit_payment_id if kind == "deposit"
                else booking.balance_payment_id if kind == "balance"
                else None
            )
            return booking, kind, payment_id

    # No usable metadata — try the line id as a payment id.
    candidate = line.get("id")
    if candidate:
        booking = (
            db.query(Booking)
            .filter(
                (Booking.deposit_payment_id == candidate)
                | (Booking.balance_payment_id == candidate)
            )
            .first()
        )
        if booking:
            resolved = "deposit" if booking.deposit_payment_id == candidate else "balance"
            return booking, resolved, candidate

    return None, kind, None


def _venue_share_cents(booking: Optional[Booking], kind: Optional[str], total_cents: int) -> int:
    """What this line is worth to the venue, per the Impulse fee model.

    Deposits are Impulse's in full (applicationFee == amount), so a deposit
    line settles nothing to the venue. On a balance, Impulse takes the
    application fee and the rest is the venue's.
    """
    if booking is None or kind != "balance":
        return 0
    balance = booking.balance_amount_cents or 0
    application_fee = round(balance * BALANCE_APPLICATION_FEE_RATE)
    return max(total_cents - application_fee, 0)


def _upsert_settlement(db: Session, transfer: dict, merchant_id: str) -> Settlement:
    """Create or update the settlement row. Transfers are webhooked more than
    once as status moves processing → complete, so this must be idempotent."""
    transfer_id = transfer["id"]
    settlement = (
        db.query(Settlement).filter(Settlement.pinch_transfer_id == transfer_id).first()
    )
    if settlement is None:
        settlement = Settlement(pinch_transfer_id=transfer_id)
        db.add(settlement)

    settlement.pinch_merchant_id = merchant_id
    settlement.status = str(transfer.get("status") or "processing")
    settlement.amount_cents = int(transfer.get("amount") or 0)
    settlement.total_fees_cents = int(transfer.get("totalFees") or 0)
    settlement.currency = str(transfer.get("currency") or "AUD")
    settlement.reference = transfer.get("reference")
    settlement.account_name = transfer.get("accountName")
    settlement.bsb = transfer.get("bsb")
    settlement.account_number = transfer.get("accountNumber")
    settlement.transfer_date = _parse_dt(transfer.get("transferDate"))
    settlement.summary = transfer.get("summary")
    return settlement


def ingest_transfer(db: Session, transfer_id: str, merchant_id: str) -> Settlement:
    """Pull a transfer and its line items into the ledger. Idempotent —
    re-ingesting replaces the lines rather than duplicating them."""
    transfer = pinch_client.get_transfer(transfer_id, merchant_id)
    settlement = _upsert_settlement(db, transfer, merchant_id)
    db.flush()  # need settlement.id before attaching lines

    # Replace rather than append: a re-delivered webhook must not double up.
    db.query(SettlementLine).filter(SettlementLine.settlement_id == settlement.id).delete()

    venue_ids: set = set()
    for line in pinch_client.iter_transfer_line_items(transfer_id, merchant_id):
        booking, kind, payment_id = _resolve_booking(db, line)
        total_cents = int(line.get("total") or 0)

        venue_id = None
        if booking is not None:
            deal = db.query(Deal).filter(Deal.id == booking.deal_id).first()
            venue_id = deal.venue_id if deal else None
            if venue_id:
                venue_ids.add(venue_id)

        db.add(SettlementLine(
            settlement_id=settlement.id,
            pinch_line_id=line.get("id"),
            pinch_payment_id=payment_id,
            booking_id=booking.id if booking else None,
            venue_id=venue_id,
            kind=kind,
            line_type=line.get("type"),
            gross_cents=int(line.get("gross") or 0),
            fees_cents=int(line.get("fees") or 0),
            total_cents=total_cents,
            venue_amount_cents=_venue_share_cents(booking, kind, total_cents),
            description=line.get("description"),
            transaction_date=_parse_dt(line.get("transactionDate")),
        ))

    # Only stamp the transfer with a venue when it unambiguously belongs to one.
    # Today, with every charge on the single Impulse merchant, a transfer spans
    # many venues and this stays null; once venues are managed merchants it
    # resolves to exactly one.
    settlement.venue_id = next(iter(venue_ids)) if len(venue_ids) == 1 else None

    db.commit()
    logger.info(
        "Ingested transfer %s: status=%s net=%sc lines=%s venues=%s",
        transfer_id, settlement.status, settlement.amount_cents,
        len(venue_ids), sorted(venue_ids),
    )
    return settlement
