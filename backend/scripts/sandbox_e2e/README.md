# Sandbox end-to-end scripts

Real Stripe sandbox runs of every money path, through the real FastAPI app
(in-process, sign-in stubbed) against a **local** database copy. Nothing touches
the live database or live Stripe: the harness refuses Supabase URLs and
non-test Stripe keys.

| Script | Covers |
|---|---|
| `money_flow.py` | Hold at booking → redeem → capture + instant payout, in the pilot (fee $0) and after it (flat 10%) |
| `no_show_and_far_off.py` | No-show (10% captured, rest released), a booking 10 days out (card saved, held later by the sweep), and a cancellation (10% kept) |
| `huddle_decline_and_update_card.py` | Huddle collapse (hold released, spots returned), a card that can't be charged, and the guest updating it |

## Setup

1. A local Postgres copy of the database with this branch's columns, e.g. `impulse_local`
   (build the schema from the models and copy rows in; see the PR for how it was done).
2. A venue in that copy whose **sandbox** Stripe account is onboarded and active
   (Payments setup in venue-web, using Stripe's test data).
3. `backend/.env` with `STRIPE_SECRET_KEY=sk_test_…` (or `rk_test_…`).

## Run

From `backend/`:

```bash
export SANDBOX_VENUE_ID=<venue uuid>                       # required
export SANDBOX_DATABASE_URL=postgresql://localhost/impulse_local   # default
PYTHONPATH=.:scripts/sandbox_e2e uv run python scripts/sandbox_e2e/money_flow.py
PYTHONPATH=.:scripts/sandbox_e2e uv run python scripts/sandbox_e2e/no_show_and_far_off.py
PYTHONPATH=.:scripts/sandbox_e2e uv run python scripts/sandbox_e2e/huddle_decline_and_update_card.py
```

Each run creates test deals and bookings in the local copy and test payments in
the sandbox, using two local-only guests (`stripe-test-guest@example.test`,
`stripe-test-guest2@example.test`).
