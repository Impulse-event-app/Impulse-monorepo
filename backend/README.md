
## Tests

```bash
uv run pytest                     # unit tests — no network, no database
```

The booking API suite (`tests/test_booking_api.py`: solo, group checkout,
Huddle Pay invites/split/guarantor, Huddles, redemption, user search) runs the
real app against a **disposable** Postgres — it creates and drops every table —
with Pinch stubbed. It's skipped unless you point it at one:

```bash
createdb impulse_test
IMPULSE_TEST_DATABASE_URL=postgresql+psycopg://localhost/impulse_test uv run pytest tests/test_booking_api.py
```

Never point `IMPULSE_TEST_DATABASE_URL` at Supabase.
