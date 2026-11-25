"""Which environment this process (or the database it points at) belongs to.

APP_ENV is set per deployment: "production" on the production Render service,
"staging" on the staging one, unset (= "local") on a laptop.

Seed and demo-data scripts call refuse_production() before writing. That checks
both APP_ENV and the database itself, because those scripts run from a laptop
whose DATABASE_URL could point anywhere: a production database is recognised by
its Supabase project ref, whatever APP_ENV says.
"""
import os
import sys

APP_ENV = os.environ.get("APP_ENV", "local").strip().lower() or "local"

# Supabase project ref(s) of the production database: the part after
# "postgres." in the pooler username, or the "db.<ref>.supabase.co" host.
PRODUCTION_SUPABASE_REFS = {
    ref.strip()
    for ref in os.environ.get("PRODUCTION_SUPABASE_REFS", "brpjunovgkncafbopndh").split(",")
    if ref.strip()
}


def is_production_database(url: str) -> bool:
    return any(ref in url for ref in PRODUCTION_SUPABASE_REFS)


def refuse_production(what: str) -> None:
    """Exit before `what` (e.g. "seed demo data") touches production."""
    # SUPABASE_URL too: some scripts write to Storage, not just Postgres.
    urls = (os.environ.get("DATABASE_URL", ""), os.environ.get("SUPABASE_URL", ""))
    if APP_ENV == "production" or any(is_production_database(u) for u in urls):
        sys.exit(f"Refusing to {what}: this is the production database. "
                 "Demo and test data belong in local or staging only.")


# Venue admins: Supabase user ids that can manage every venue, including ones
# created later, as if they owned it (portal, deals, schedules, bookings,
# Stripe setup). A comma-separated list in VENUE_ADMIN_USER_IDS, set per
# backend on Render: staging lists test accounts, production lists only the
# founders' own accounts. User ids are per database, so a staging id never
# matches anyone in production.
VENUE_ADMIN_USER_IDS = frozenset(
    uid.strip()
    for uid in os.environ.get("VENUE_ADMIN_USER_IDS", "").split(",")
    if uid.strip()
)


def is_venue_admin(user: dict) -> bool:
    return user.get("sub") in VENUE_ADMIN_USER_IDS


def can_manage_venue(owner_id, user: dict) -> bool:
    """True if `user` (decoded JWT) owns the venue or is a venue admin."""
    uid = user.get("sub")
    return bool(uid) and (str(owner_id) == uid or is_venue_admin(user))
