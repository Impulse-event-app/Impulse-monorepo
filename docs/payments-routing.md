# Payments routing: where venue money goes

*Rewritten 5 Nov 2026, when payments moved from Pinch to Stripe Connect.*

## Summary

Every booking is a Stripe **destination charge**: it lives on Impulse's platform account and names the venue's connected account as the destination. When the venue checks the group in, the money moves to the venue's Stripe balance, and the backend asks Stripe for an **Instant Payout** to the venue's bank.

## The money flow

1. **Claim a spot.** The app calls `POST /bookings/{id}/pay/start`. The backend creates a PaymentIntent for the seat's **whole share** (`booking_flow.start_hold`) with:
   - `capture_method=manual`
   - `transfer_data.destination` = the venue's account
   - `setup_future_usage=off_session`, on the user's Stripe Customer

   PaymentSheet confirms it (card, saved card, Apple Pay, Google Pay). Then `POST /bookings/{id}/pay` reads it back and marks the seat in (`confirm_hold`). **Nothing is charged.**
   - Bookings more than 6 days out save the card with a SetupIntent instead. The sweep places the hold 4 days before the slot (card holds last 7 days, and Visa merchant-initiated holds last about 4d 18h).
2. **Check-in.** The venue redeems the six-digit code, and `booking_flow.redeem` captures every seat's hold. A lapsed hold is re-placed on the same card and captured. A failed capture is flagged for the venue to collect at the till. Then `payouts.pay_out_booking` sends the instantly available balance to the venue.
3. **Huddle collapse or cancel.** Holds are cancelled (`refund_participants`). No refund, no fee.
4. **No-show.** 12 hours after the slot, the sweep captures each seat's 10% (`deposit_cents`) and releases the rest. The booking becomes `no_show`.

## Fees (`payments.impulse_fee`, the only place this lives)

- **Pilot** (`venues.pilot_ends_at` in the future, or unset): `application_fee_amount = 0`. The venue gets 100%.
  - `pilot_ends_at` defaults to 3 months after the venue creates its Stripe account. Set it by hand to change it.
- **After the pilot:** a flat 10%. The application fee is the seat's `deposit_cents`, capped at the amount captured, so venues receive exactly 90%.
- **Impulse always absorbs Stripe's fees:** the card fee (1.7% + 30c domestic, 3.5% + 30c international) and the 1% Instant Payout fee. With destination charges Stripe bills them to the platform, so after the pilot they come out of Impulse's 10% and during the pilot Impulse pays them outright. Decided 5 Nov 2026.

## Venue onboarding

- `POST /merchants/venues/{id}` creates an **Accounts v2** connected account:
  - `dashboard: express`
  - `fees_collector` and `losses_collector`: `application`
  - recipient configuration with `stripe_balance.stripe_transfers`
- venue-web renders Stripe's embedded `account_onboarding` and `notification_banner` components, using `POST …/account-session`.
- A venue can publish deals only when `stripe_transfers` is `active` (`merchants.can_publish_deals`). This now applies to **every** venue, including the demo venues.
- Status updates arrive as thin v2 events on `/webhooks/stripe/accounts` (see `backend/.env.example` for the event list), and `GET …/status` re-reads them live.

## Liability

Impulse is the merchant of record and owns disputes and negative balances (`losses_collector: application`). Instant Payouts pay venues before the dispute window closes, so a chargeback on a paid-out booking can leave Impulse covering it. `charge.dispute.created` is logged at ERROR; respond to disputes in the Stripe Dashboard.

## Still to do before live

- Create the Stripe account and a sandbox, and set keys in Render and in both apps:
  - `STRIPE_SECRET_KEY` (restricted key)
  - the three webhook secrets
  - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Apply migration `c8f1a3e5d927` (additive).
- Confirm with Stripe:
  - the platform's Instant Payout daily limit;
  - that recipient-configuration AU accounts are eligible for Instant Payouts;
  - that your venue categories aren't restricted.
- Apple Pay: register the merchant ID `merchant.au.impulseapp.impulse` in Apple Developer and Stripe, then make a new native build.
- After live, a cleanup migration drops the Pinch columns and tables (`pinch_*`, `merchant_documents`, `settlements`, `settlement_lines`, `payment_methods`).
