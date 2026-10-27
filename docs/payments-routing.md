# Payments routing: where venue money actually goes

*Noted 27 Oct 2026, ahead of the Nightowl meeting.*

## Summary

The plan is for each venue's takings to settle **directly into its own Pinch merchant account**. **The code doesn't do that yet.** Every charge still runs through **one shared Impulse merchant**, and that merchant is Pinch's **test** merchant.

Until routing changes, don't tell venues "the money goes straight into your account".

## What the code does today

Every Pinch charge uses a single merchant ID read from the environment:

- `backend/booking_flow.py:43`: `PINCH_MERCHANT_ID = os.environ["PINCH_TEST_MERCHANT_ID"]`
- `backend/wallet.py:22`: the same variable, for saved cards
- The charge calls in `booking_flow.py` all pass that one ID:
  - line 416: deposit
  - line 492: guarantor
  - line 545: balance at redemption
  - line 584: further charges

`backend/payments.py` says this in its header comment:

> Note this is the *fee* split, not the *routing*. Both charges still run through the single Impulse merchant, so a zero application fee means Impulse collects the balance and owes it onward. Routing the balance to each venue's own managed merchant is what makes the money actually land in their account.

**Fee model:**
- **Deposit:** Impulse's whole take.
- **Balance:** belongs to the venue in full.

Because both charges land in Impulse's merchant, Impulse currently holds the venue's balance and owes it onward.

## What Payments setup does

`venue-web` → **Payments setup** (`backend/routers/merchants.py`) onboards each venue as its **own** Pinch managed merchant: business details, bank account, directors and ID documents. Once Pinch approves the venue, `merchant_status` becomes `active`.

That status only controls **whether deals can be published** (`can_publish_deals`, `routers/merchants.py:510`). **It doesn't change where charges go.** A fully verified venue's guests still pay into the shared Impulse merchant.

## What the Payouts page is for

`/dashboard/payouts` (`get_payouts` in `routers/venues.py`, with `backend/settlements.py`) shows **Pinch transfers**: money actually sent to a bank account, which happens days after a card is approved.

Because one shared merchant takes every venue's money, a single transfer covers many venues. The page picks out each venue's own booking lines and share of each transfer.

It only makes sense while money is pooled. Once charges route to each venue's own merchant, Pinch pays venues directly and they'd see payouts in their own Pinch account. **The page is hidden from the sidebar as of 27 Oct 2026**, but the route still exists.

## What needs to change

1. **Route each charge to the venue's own merchant when it's active.** The four charge sites in `booking_flow.py` (and `wallet.py` for vaulting) should use `deal.venue.pinch_merchant_id` when `pinch_merchant_status == "active"`, and fall back to the shared merchant otherwise.
2. **Vault cards against the right merchant.** In Pinch, payers and sources belong to a merchant, so a card saved on the shared merchant may not be chargeable on a venue's merchant. Check how Pinch handles payers across managed merchants before switching.
3. **Keep Impulse's take as an application fee** on the deposit, charged on the venue's merchant, so the deposit still reaches Impulse.
4. **Move production off the test merchant:** replace `PINCH_TEST_MERCHANT_ID` with a live merchant and live credentials.
5. **Decide what happens to Payouts:** delete it, or keep it only for venues still on the shared merchant.
6. **Fix the copy that promises direct settlement:**
   - the dashboard banner ("Set up payments to get paid directly")
   - the Payments setup intro
   - the onboarding text

   Right now these describe the intended behaviour, not the current one.
