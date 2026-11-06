"""
Instant Payouts to venues — the "money within minutes of check-in" promise.

Card money captured on a destination charge lands in the venue's connected
account balance immediately and is available for an Instant Payout straight
away (docs.stripe.com/connect/instant-payouts). After a booking is redeemed,
pay_out_booking() sends whatever is instantly available to the venue's
instant-eligible bank account or debit card.

- Stripe charges the platform 1% per Instant Payout (A$0.50 minimum). During a
  venue's pilot Impulse absorbs it; after the pilot payments.impulse_fee()
  passes it on through the application fee.
- A venue whose bank can't take instant payouts falls back to Stripe's
  standard daily payout schedule — nothing to do here.
- This must never fail a redemption. Errors are logged, the booking is marked
  payout_status "failed", and the sweep retries for two days.
"""
import logging

from sqlalchemy import or_
from sqlalchemy.orm import Session

import stripe_client
from models import Booking

logger = logging.getLogger("impulse.payouts")

INSTANT_PAYOUT_MIN_CENTS = 50


def _instant_destination(balance: dict):
    """(destination, amount) for the AUD instantly-available balance, or None."""
    for entry in balance.get("instant_available") or []:
        if entry.get("currency") != stripe_client.CURRENCY:
            continue
        for net in entry.get("net_available") or []:
            if net.get("destination") and (net.get("amount") or 0) > 0:
                return net["destination"], net["amount"]
    return None


def pay_out_booking(db: Session, b: Booking) -> None:
    venue = b.deal.venue if b.deal else None
    if b.stripe_payout_id or not venue or not venue.stripe_account_id:
        return
    try:
        found = _instant_destination(stripe_client.retrieve_balance(venue.stripe_account_id))
        if not found:
            # No instant-eligible account (or nothing available yet): Stripe's
            # standard schedule pays it out.
            b.payout_status = "standard"
        else:
            destination, amount = found
            if amount < INSTANT_PAYOUT_MIN_CENTS:
                b.payout_status = "standard"
            else:
                payout = stripe_client.create_payout(venue.stripe_account_id, {
                    "amount": amount,
                    "currency": stripe_client.CURRENCY,
                    "method": "instant",
                    "destination": destination,
                    "metadata": {"impulseBookingId": str(b.id)},
                }, idempotency_key=f"payout-{b.id}")
                logger.info("Booking %s: instant payout %s of %d cents to venue %s",
                            b.id, payout["id"], amount, venue.id)
                _record_payout(db, b, payout)
                return
    except stripe_client.StripeError as e:
        logger.error("Instant payout for booking %s (venue %s) failed: %s", b.id, venue.id, e)
        b.payout_status = "failed"
    except Exception:
        logger.exception("Instant payout for booking %s crashed", b.id)
        b.payout_status = "failed"
    db.commit()


def _record_payout(db: Session, b: Booking, payout: dict) -> None:
    """Save the payout without ever downgrading "paid".

    Instant payouts can be paid, and the payout.paid webhook processed, before
    this commit lands. Writing "pending" unconditionally would then overwrite
    the webhook's "paid" and leave the booking stuck. So take the status Stripe
    returned, and only write where the row isn't already paid."""
    status = "paid" if payout.get("status") == "paid" else "pending"
    db.query(Booking).filter(Booking.id == b.id).update(
        {Booking.stripe_payout_id: payout["id"]}, synchronize_session=False)
    db.query(Booking).filter(
        Booking.id == b.id, or_(Booking.payout_status.is_(None), Booking.payout_status != "paid"),
    ).update({Booking.payout_status: status}, synchronize_session=False)
    db.commit()
    db.refresh(b)
