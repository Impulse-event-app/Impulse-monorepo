## Database

Schema changes are Alembic migrations (`uv run alembic revision -m "..."`);
each deploy runs `alembic upgrade head` on boot. A brand-new database is set up
with `uv run python scripts/bootstrap_db.py` (applies `db/baseline.sql`, then
stamps Alembic). Demo-data scripts refuse to run against production. See
[docs/environments.md](../docs/environments.md) for staging vs production.


## Tests

```bash
uv run pytest                     # unit tests — no network, no database
```

The booking API suite (`tests/test_booking_api.py`: solo, group checkout,
Huddle Pay invites/split/guarantor, Huddles, redemption, user search) runs the
real app against a **disposable** Postgres — it creates and drops every table —
with Stripe stubbed. It's skipped unless you point it at one:

```bash
createdb impulse_test
IMPULSE_TEST_DATABASE_URL=postgresql+psycopg://localhost/impulse_test uv run pytest tests/test_booking_api.py
```

Never point `IMPULSE_TEST_DATABASE_URL` at Supabase.
