"""
Synthesise Pinch transfers over already-redeemed bookings, so the venue
Payouts page has something to show without waiting on a real settlement.

Real transfers arrive days after the charge, which makes the payouts screen
undemoable on a fresh database. This walks the venue's fully-paid bookings,
groups them into weekly batches the way Pinch batches a settlement run, and
writes settlements + settlement_lines directly.

    python seed_settlements.py --venue-id <uuid>
    python seed_settlements.py --venue-id <uuid> --wipe

This writes ONLY to the settlements tables — bookings and payments are never
touched. Rows are marked with a `seed_` transfer id prefix so --wipe can find
them again and so they are obvious in the database. Nothing here talks to
Pinch; it is demo scaffolding, not a backfill. To ingest a genuine transfer,
use settlements.ingest_transfer().
"""

import argparse
import uuid
from datetime import datetime, timedelta, timezone

from database import SessionLocal
from models import Booking, Deal, Settlement, SettlementLine, Venue
from payments import BALANCE_APPLICATION_FEE_RATE

SEED_PREFIX = "seed_tra_"

# Pinch's card fee, only used to make the synthetic numbers look plausible.
_ASSUMED_FEE_RATE = 0.0175


def _uid() -> str:
    return str(uuid.uuid4())


def _week_start(dt: datetime) -> datetime:
    """Monday 00:00 of the week containing dt — the batch key."""
    d = dt.astimezone(timezone.utc)
    monday = d - timedelta(days=d.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def seed_settlements(venue_id: str, wipe: bool = False) -> None:
    db = SessionLocal()
    try:
        venue = db.query(Venue).filter(Venue.id == venue_id).first()
        if not venue:
            raise SystemExit(f"No venue with id {venue_id}")

        if wipe:
            seeded = (
                db.query(Settlement)
                .filter(Settlement.pinch_transfer_id.like(f"{SEED_PREFIX}%"))
                .all()
            )
            ids = [s.id for s in seeded]
            if ids:
                db.query(SettlementLine).filter(SettlementLine.settlement_id.in_(ids)).delete(
                    synchronize_session=False
                )
                db.query(Settlement).filter(Settlement.id.in_(ids)).delete(
                    synchronize_session=False
                )
                db.commit()
            print(f"Wiped {len(ids)} seeded settlement(s).")

        deal_ids = [d.id for d in db.query(Deal).filter(Deal.venue_id == venue_id).all()]
        if not deal_ids:
            raise SystemExit(f"Venue {venue.name} has no deals — run seed.py first.")

        # Only balance charges settle to a venue; the deposit is Impulse's in full.
        bookings = (
            db.query(Booking)
            .filter(
                Booking.deal_id.in_(deal_ids),
                Booking.payment_status == "fully_paid",
                Booking.redeemed_at.isnot(None),
            )
            .order_by(Booking.redeemed_at)
            .all()
        )
        if not bookings:
            raise SystemExit(
                f"Venue {venue.name} has no redeemed, fully-paid bookings to settle."
            )

        # Anything already covered by a real (or previously seeded) settlement.
        already = {
            row.booking_id
            for row in db.query(SettlementLine.booking_id)
            .filter(SettlementLine.venue_id == venue_id)
            .all()
            if row.booking_id
        }

        batches: dict = {}
        for b in bookings:
            if b.id in already:
                continue
            batches.setdefault(_week_start(b.redeemed_at), []).append(b)

        if not batches:
            print("Every redeemed booking is already covered by a settlement. Nothing to do.")
            return

        now = datetime.now(timezone.utc)
        created = 0
        for week, batch in sorted(batches.items()):
            # Pinch settles a few days behind the transactions in the batch.
            transfer_date = week + timedelta(days=9)
            # The most recent batch is still moving; older ones have landed.
            status = "processing" if (now - transfer_date) < timedelta(days=2) else "complete"

            settlement = Settlement(
                id=_uid(),
                pinch_transfer_id=f"{SEED_PREFIX}{week:%Y%m%d}_{venue_id[:8]}",
                pinch_merchant_id=None,
                venue_id=venue_id,
                status=status,
                currency="AUD",
                reference=f"IMPULSE {week:%d%b}".upper(),
                account_name=venue.name,
                bsb="062-000",
                account_number="****4821",
                transfer_date=transfer_date,
            )
            db.add(settlement)

            gross_total = 0
            fees_total = 0
            venue_total = 0
            for b in batch:
                balance = b.balance_amount_cents or 0
                fees = round(balance * _ASSUMED_FEE_RATE)
                total = balance - fees
                application_fee = round(balance * BALANCE_APPLICATION_FEE_RATE)
                venue_amount = max(total - application_fee, 0)

                db.add(SettlementLine(
                    id=_uid(),
                    settlement_id=settlement.id,
                    pinch_line_id=b.balance_payment_id,
                    pinch_payment_id=b.balance_payment_id,
                    booking_id=b.id,
                    venue_id=venue_id,
                    kind="balance",
                    line_type="Settlement",
                    gross_cents=balance,
                    fees_cents=fees,
                    total_cents=total,
                    venue_amount_cents=venue_amount,
                    description=f"Impulse balance — {venue.name}",
                    transaction_date=b.redeemed_at,
                ))
                gross_total += balance
                fees_total += fees
                venue_total += venue_amount

            settlement.amount_cents = venue_total
            settlement.total_fees_cents = fees_total
            settlement.summary = [
                {"name": "Settlements", "count": len(batch), "gross": gross_total,
                 "fees": fees_total, "total": gross_total - fees_total},
                {"name": "Application Fees", "count": len(batch), "gross": 0,
                 "fees": 0, "total": -(gross_total - fees_total - venue_total)},
            ]
            created += 1
            print(
                f"  {transfer_date:%d %b %Y}  {status:<10} "
                f"{len(batch):>2} booking(s)  ${venue_total / 100:,.2f}"
            )

        db.commit()
        print(f"\nCreated {created} settlement(s) for {venue.name}.")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create demo settlements over a venue's redeemed bookings."
    )
    parser.add_argument("--venue-id", required=True, help="Venue UUID to create payouts for.")
    parser.add_argument(
        "--wipe", action="store_true",
        help="Remove previously seeded settlements (seed_tra_*) before creating new ones.",
    )
    args = parser.parse_args()
    seed_settlements(venue_id=args.venue_id, wipe=args.wipe)
