# Impulse monorepo

Apps: `backend/` (FastAPI on Render, Supabase Postgres), `mobile-sdk54/` (Expo iOS app
and web app), `venue-web/` (Next.js venue portal on Vercel). Each app folder may have
its own CLAUDE.md. Full environment setup: `docs/environments.md`.

## Branches and environments

| Branch | Environment | Backend (Render) | Database | Stripe | iOS app | Venue portal |
|---|---|---|---|---|---|---|
| `dev` | staging | `impulse-staging` | staging Supabase (`pdcevxkvgtptjczzsmkh`) | test keys | **Impulse Staging** (TestFlight) | dev.venues.impulseapp.au |
| `main` | production | `Impulse-monorepo` | production Supabase | live keys | **Impulse** (TestFlight → App Store) | venues.impulseapp.au |

Flow:
1. Branch off `dev` (`git switch dev && git pull && git switch -c my-change`).
2. Open a PR into **`dev`**. CI runs the tests for the folders you changed.
3. Merge. CI deploys staging: staging backend, an Impulse Staging build to TestFlight,
   the staging web app; Vercel deploys the portal's `dev` branch.
4. Test on staging.
5. Release: open a PR from `dev` into **`main`** and merge. CI deploys production and
   uploads an Impulse build to TestFlight. Submitting to App Review is manual.

Hotfix: branch off `main`, PR into `main`, then merge `main` back into `dev`.
Never push straight to `dev` or `main`.

## Database rules

- Staging and production are **two separate databases**. They share only the schema,
  which lives in Alembic migrations in `backend/migrations/versions/`.
- Schema changes are **Alembic migrations only**: `uv run alembic revision -m "..."`,
  write `upgrade()`/`downgrade()` by hand (autogenerate proposes unrelated changes), commit.
  Never change tables in the Supabase dashboard; the other environment would never get it.
- Each backend runs `alembic upgrade head` on start, so a migration reaches staging when
  `dev` deploys and production when `main` deploys.
- Migrations must work with the code that is still running: add columns nullable or with
  a default; drop or rename only in a later release once nothing reads the old column.
- A brand-new empty database is set up once with `uv run python scripts/bootstrap_db.py`
  (baseline schema + Alembic stamp), never with `alembic upgrade head` alone.
- Seed/demo/test data never goes to production. The seed scripts refuse to run there
  (`backend/environment.py`).

## Secrets

Never commit or paste keys. They live in Render (backend), EAS environments
(`preview` = staging, `production`), Vercel (Preview scoped to `dev`, Production), and
GitHub Actions secrets.
