# Environments: local, staging, production

| | Local | Staging (`dev` branch) | Production (`main` branch) |
|---|---|---|---|
| Database | Local Postgres or the staging DB | Supabase project (current one, `pdcevxkvgtptjczzsmkh`) | New Supabase project, real data only |
| Stripe | Test keys | Test keys | Live keys |
| Backend | `uv run uvicorn main:app --reload` | Render: `impulse-staging` | Render: `Impulse-monorepo` |
| venue-web | `npm run dev` | `staging.venues.impulseapp.au` (Vercel, `dev` branch) | `venues.impulseapp.au` (Vercel, `main`) |
| iOS app | Simulator / dev build | **Impulse Staging** (`au.impulseapp.impulse.staging`) on TestFlight | **Impulse** (`au.impulseapp.impulse`): TestFlight, then App Store |
| Web app | `npx expo start --web` | `impulse--staging.expo.app` | `impulse.expo.app` |
| EAS environment | `development` | `preview` | `production` |

## Day to day

1. Branch off `dev`, open a PR into `dev`. CI runs the tests.
2. Merge it. CI deploys staging: the staging backend, a new **Impulse Staging**
   build to TestFlight, and the staging web app. Vercel deploys venue-web's
   `dev` branch to the staging domain.
3. Check it on staging.
4. Open a PR from `dev` into `main` (the release). Merge it. CI deploys
   production and uploads an **Impulse** build to TestFlight.
5. When a production build should go to the public, open App Store Connect
   and press **Submit for review**. Nothing submits to review automatically.

Urgent fix on production: branch off `main`, PR into `main`, then merge `main`
back into `dev` so the two don't drift apart.

## Database rules

- **Schema changes are Alembic migrations, only.** `uv run alembic revision -m "..."`,
  write the upgrade, commit. Each backend boots with `alembic upgrade head`, so
  staging gets the change when `dev` deploys and production when `main` does.
  Don't edit tables in the Supabase dashboard. Note: `alembic revision
  --autogenerate` currently proposes unrelated changes (the models and the
  database already differ, e.g. the `waitlist` table isn't in `models.py`),
  so read what it generates or write migrations by hand.
- **A brand-new database** (production now, or a replacement staging/local DB)
  is set up once with `uv run python scripts/bootstrap_db.py`. It applies
  `backend/db/baseline.sql` and stamps Alembic, and refuses to touch a
  database that already has tables.
- **Demo and test data never go to production.** `seed.py`, `seed_reels.py`,
  `seed_history.py` and `scripts/sandbox_e2e` exit if `APP_ENV=production` or
  if `DATABASE_URL`/`SUPABASE_URL` points at the production project
  (`PRODUCTION_SUPABASE_REFS` in `backend/environment.py`).

## One-time setup

Done in dashboards, in this order. Steps marked ✱ give you a value to paste
somewhere else.

### 1. Production Supabase project
1. Create a project (Sydney region, same as staging). ✱ Note its **project ref**
   and put it in `PRODUCTION_SUPABASE_REFS` in `backend/environment.py`.
2. From `backend/`, against the new project's **session pooler** URL:
   `DATABASE_URL=postgresql+psycopg://postgres.<ref>:<password>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres uv run python scripts/bootstrap_db.py`
3. Authentication → Providers: enable Email, Phone (same SMS provider as
   staging), Google (same OAuth client; add the new project's callback URL in
   Google Cloud), Apple (client id `au.impulseapp.impulse`).
4. Authentication → URL Configuration: add `impulse://**`,
   `https://impulse.expo.app/**` and `https://venues.impulseapp.au/**`.

### 2. Staging Supabase project (the current one)
1. Apple provider: add `au.impulseapp.impulse.staging` to the client ids.
2. URL Configuration: add `impulse-staging://**`,
   `https://impulse--staging.expo.app/**`, `https://staging.venues.impulseapp.au/**`.
3. Delete the old `_legacy_huddles` / `_legacy_huddle_members` tables when convenient.

### 3. Stripe
- **Live mode:** turn on Connect, create the webhook endpoints that staging
  has (payments, Connect, accounts) pointing at the production backend.
  ✱ Live secret key + three webhook secrets → production Render.
  ✱ Live publishable key → EAS `production` env and Vercel production.
- **Test mode:** point the existing webhooks at the staging backend's URL.

### 4. Render
1. **New web service `impulse-staging`**: same repo, root `backend`, branch
   `dev`, auto-deploy **off** (CI triggers it), free plan.
   Build: `pip install uv && uv sync --frozen`
   Start: `uv run alembic upgrade head && uv run uvicorn main:app --host 0.0.0.0 --port $PORT`
   Env: copy production's, then: `APP_ENV=staging`, the staging DB URL and
   Supabase keys, Stripe **test** keys, `APNS_BUNDLE_ID` and `APPLE_CLIENT_ID` =
   `au.impulseapp.impulse.staging`.
   ✱ Settings → Deploy Hook → GitHub secret `RENDER_STAGING_DEPLOY_HOOK_URL`.
2. **Production service `Impulse-monorepo`**: change the start command to the
   one above, set `APP_ENV=production`, and switch DB/Supabase/Stripe values to
   the new production project and Stripe live keys.

### 5. Apple
1. App Store Connect → new app **Impulse Staging**, bundle id
   `au.impulseapp.impulse.staging` (register the id in the developer portal
   with Sign in with Apple, Push, Apple Pay `merchant.au.impulseapp.impulse`).
   ✱ Its Apple ID (number) → `submit.staging.ios.ascAppId` in `mobile-sdk54/eas.json`.
   It never needs to go to review: TestFlight internal testing only.
2. First staging build from a laptop, so EAS can create the signing
   certificates and push key for the new bundle id:
   `cd mobile-sdk54 && npx eas-cli build -p ios --profile staging`
   After that CI builds it.

### 6. EAS environment variables
- `preview` (staging): the staging values: `EXPO_PUBLIC_API_URL` = staging
  Render URL, staging Supabase URL/anon key, Stripe test publishable key,
  `EXPO_PUBLIC_WEB_URL=https://impulse--staging.expo.app`.
- `production`: production Render URL, new Supabase URL/anon key, Stripe live
  publishable key, `EXPO_PUBLIC_WEB_URL=https://impulse.expo.app`.

### 7. Vercel (venue-web)
- Production env (`main`): new Supabase URL/anon key, production API URL,
  Stripe live publishable key.
- Preview env, scoped to branch `dev`: staging values. Domains → add
  `staging.venues.impulseapp.au` and assign it to the `dev` branch.

### 8. GitHub
- Create the `dev` branch from `main`, and make it the default branch so
  PRs target it.
- Branch protection on `main` and `dev`: require PRs and passing CI.
