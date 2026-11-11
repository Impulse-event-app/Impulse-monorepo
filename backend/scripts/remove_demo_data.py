"""Remove the demo venues (and everything hanging off them) before launch.

Eight fake venues live in the DB under owner@test.com: The Lantern Room (the
first test venue) and seven added for testing, with every-day deal schedules that make a new deal each night, Discover reels, and
photos. They look real, so they must go before real users arrive. This removes:

  - bookings on their deals (incl. Huddles whose ballots name one of them),
    with their seats, Live Activity tokens and settlement lines
  - their deals and weekly deal schedules (so no new deals are generated)
  - their reels, user_venue_interactions, merchant documents
  - the venues themselves
  - the Storage files those rows point to (venue-photos, venue-reels) — only
    files under the demo owner's folder and not used by any venue that stays

The venues are named by ID below, and each must
still belong to the demo owner or nothing happens. The owner@test.com login
itself is not deleted here; remove it in Supabase → Authentication afterwards.

Dry run by default (prints what would go, changes nothing). From backend/:

    uv run python scripts/remove_demo_data.py                       # dry run
    uv run python scripts/remove_demo_data.py --apply               # do it

The database part is one transaction: all of it or none. Storage files are
deleted only after that commits (needs SUPABASE_SERVICE_ROLE_KEY). Take a
backup first, and run it before switch_to_live.py.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

from database import SessionLocal, engine  # noqa: E402

APPLY = "--apply" in sys.argv

DEMO_OWNER = "1e66cd1e-88e4-4e3d-ae30-ff902839a76b"   # owner@test.com
DEMO_VENUES = {
    "2d63e282-187f-4a32-8eb2-c497c5aa0bb3": "Blacklight Putt",
    "c5dec4fa-77d8-40e3-a57b-f31fb278dc3f": "Corner Pocket",
    "7aad6ab8-82ac-4fca-b135-9867dccd06a8": "Echo Chamber Karaoke",
    "7cef9f38-ead9-4de8-8aa9-20ed36c8c255": "Kingpin Lanes",
    "c4d388cd-f984-4da1-9a3f-f70ef32b5752": "Laugh Track",
    "b937eeb9-a4b5-4ef4-b21d-5a5a544f942f": "Low Frequency",
    "ff68340f-3e6b-4540-8871-f21e61400379": "The Vault Escape",
    # The first test venue, made as "The Lantern Room" and since renamed
    # "Flight Club" while testing the portal; not Frank's real venue.
    "c90c196d-4357-402f-88e9-d1e613c7feae": "The Lantern Room / Flight Club",
}
BUCKETS = ("venue-photos", "venue-reels")

# Every foreign key into the tables this script deletes from, and how it is
# handled. If the live DB has one not listed here (a hand-added table), the
# script stops rather than fail halfway or leave orphans.
KNOWN_REFS = {
    ("bookings", "deal_id"), ("bookings", "initiator_member_id"),
    ("booking_participants", "booking_id"), ("booking_participants", "covered_by_member_id"),
    ("live_activity_tokens", "booking_id"), ("live_activity_tokens", "member_id"),
    ("settlement_lines", "booking_id"), ("settlement_lines", "venue_id"),
    ("settlement_lines", "settlement_id"), ("settlements", "venue_id"),
    ("deals", "venue_id"), ("deals", "schedule_id"), ("deals", "reel_id"),
    ("deal_schedules", "venue_id"), ("deal_schedules", "reel_id"),
    ("venue_reels", "venue_id"), ("merchant_documents", "venue_id"),
    ("user_venue_interactions", "venue_id"),
}
TOUCHED = ("venues", "deals", "deal_schedules", "venue_reels", "bookings",
           "booking_participants", "settlements")


def q(db, sql, **params):
    return db.execute(text(sql), params)


def ids(db, sql, **params):
    return [str(r[0]) for r in q(db, sql, **params)]


def table_exists(db, name):
    return q(db, "select to_regclass(:n) is not null", n=f"public.{name}").scalar()


def check_foreign_keys(db):
    rows = q(db, """
        select cl.relname, a.attname, ref.relname
          from pg_constraint c
          join pg_class cl  on cl.oid = c.conrelid
          join pg_class ref on ref.oid = c.confrelid
          join pg_namespace n on n.oid = ref.relnamespace and n.nspname = 'public'
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
         where c.contype = 'f' and ref.relname = any(:touched)
    """, touched=list(TOUCHED)).all()
    unknown = sorted({(t, col, ref) for t, col, ref in rows if (t, col) not in KNOWN_REFS})
    if unknown:
        print("Stopping: these foreign keys point at rows this script would delete,")
        print("and it doesn't know how to handle them:")
        for t, col, ref in unknown:
            print(f"    {t}.{col} -> {ref}")
        sys.exit(1)


def storage_path(url, owner):
    """(bucket, path) for a public Storage URL in the demo owner's folder, else None."""
    base = os.environ["SUPABASE_URL"].rstrip("/") + "/storage/v1/object/public/"
    if not url or not url.startswith(base):
        return None
    bucket, _, path = url[len(base):].partition("/")
    path = path.split("?")[0]
    if bucket not in BUCKETS or not path.startswith(owner + "/"):
        return None
    return bucket, path


def media_urls(db, venue_ids):
    urls = set()
    for image_url, image_urls in q(db, "select image_url, image_urls from venues where id = any(cast(:v as uuid[]))",
                                   v=venue_ids):
        urls.add(image_url)
        urls.update(image_urls or [])
    for video, poster in q(db, "select video_url, poster_url from venue_reels where venue_id = any(cast(:v as uuid[]))",
                           v=venue_ids):
        urls.update((video, poster))
    return {u for u in urls if u}


def delete_storage(files):
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        print("\nSUPABASE_SERVICE_ROLE_KEY is not set: Storage files were NOT deleted:")
        for bucket, path in sorted(files):
            print(f"    {bucket}/{path}")
        return
    base = os.environ["SUPABASE_URL"].rstrip("/")
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    for bucket in BUCKETS:
        paths = sorted(p for b, p in files if b == bucket)
        if not paths:
            continue
        r = httpx.request("DELETE", f"{base}/storage/v1/object/{bucket}",
                          headers=headers, json={"prefixes": paths}, timeout=30)
        if r.is_success:
            print(f"Storage: removed {len(r.json())} of {len(paths)} files from {bucket}")
        else:
            print(f"Storage: {bucket} delete failed ({r.status_code}): {r.text[:300]}")
            print("    The database part is done; delete these files by hand:")
            for p in paths:
                print(f"    {bucket}/{p}")


def main() -> None:
    print(f"Database: {engine.url.host}/{engine.url.database}  ({'APPLY' if APPLY else 'dry run'})\n")
    with SessionLocal() as db:
        check_foreign_keys(db)

        # ── which venues ──────────────────────────────────────
        wanted = list(DEMO_VENUES)
        # Lock them: a deal the nightly generator tries to add meanwhile waits,
        # then fails its foreign key, instead of being left behind.
        rows = q(db, "select id, name, owner_id from venues where id = any(cast(:v as uuid[]))"
                     + (" for update" if APPLY else ""), v=wanted).all()
        found = {str(r.id): r for r in rows}
        wrong_owner = [r for r in rows if str(r.owner_id) != DEMO_OWNER]
        if wrong_owner:
            print("Stopping: these venues no longer belong to the demo owner:")
            for r in wrong_owner:
                print(f"    {r.name} ({r.id}) owner {r.owner_id}")
            sys.exit(1)
        venue_ids = list(found)
        print(f"Venues to remove: {len(venue_ids)}")
        for vid in wanted:
            r = found.get(vid)
            print(f"    {'-' if r else '(already gone)'} {r.name if r else DEMO_VENUES.get(vid, vid)}")
        kept = q(db, "select name from venues where owner_id = :o and id <> all(cast(:v as uuid[]))",
                 o=DEMO_OWNER, v=venue_ids).scalars().all()
        if kept:
            print(f"Also owned by owner@test.com but NOT in the list, kept: {', '.join(kept)}")
        if not venue_ids:
            print("\nNothing to do.")
            return

        # ── what hangs off them ───────────────────────────────
        deal_ids = ids(db, "select id from deals where venue_id = any(cast(:v as uuid[]))", v=venue_ids)
        booking_ids = set(ids(db, "select id from bookings where deal_id = any(cast(:d as uuid[]))", d=deal_ids))
        # Huddles still voting have no deal yet; their ballots list deal ids.
        booking_ids |= set(ids(db, """
            select distinct p.booking_id from booking_participants p
              join bookings b on b.id = p.booking_id
             where b.deal_id is null and p.ballot is not null
               and exists (select 1 from jsonb_array_elements_text(p.ballot) e
                            where e = any(cast(:d as text[])))
        """, d=deal_ids))
        booking_ids = list(booking_ids)
        seat_ids = ids(db, "select id from booking_participants where booking_id = any(cast(:b as uuid[]))",
                       b=booking_ids)
        statuses = q(db, """select status, count(*) from bookings where id = any(cast(:b as uuid[]))
                            group by status order by status""", b=booking_ids).all()

        def count(table, where, **p):
            if not table_exists(db, table):
                return 0
            return q(db, f"select count(*) from {table} where {where}", **p).scalar()

        v = dict(v=venue_ids)
        counts = {
            "deals": len(deal_ids),
            "deal schedules": count("deal_schedules", "venue_id = any(cast(:v as uuid[]))", **v),
            "reels": count("venue_reels", "venue_id = any(cast(:v as uuid[]))", **v),
            "bookings": len(booking_ids),
            "booking seats": len(seat_ids),
            "interactions": count("user_venue_interactions", "venue_id = any(cast(:v as uuid[]))", **v),
            "merchant documents": count("merchant_documents", "venue_id = any(cast(:v as uuid[]))", **v),
            "settlement lines": count("settlement_lines",
                                      "venue_id = any(cast(:v as uuid[])) or booking_id = any(cast(:b as uuid[]))",
                                      b=booking_ids, **v),
            "settlements": count("settlements", "venue_id = any(cast(:v as uuid[]))", **v),
        }
        print()
        for label, n in counts.items():
            print(f"{label + ':':<22}{n}")
        if statuses:
            print("bookings by status:   " + ", ".join(f"{s} {n}" for s, n in statuses))
        live_money = q(db, """select count(*) from booking_participants
                               where id = any(cast(:s as uuid[])) and hold_status = 'held'""", s=seat_ids).scalar()
        if live_money:
            print(f"\nNote: {live_money} seat(s) still hold a card authorisation on sandbox Stripe.")
            print("Deleting the rows doesn't release them; sandbox holds lapse on their own.")

        # Storage: files the demo rows use, minus any a kept venue still uses.
        urls = media_urls(db, venue_ids)
        others = ids(db, "select id from venues where id <> all(cast(:v as uuid[]))", v=venue_ids)
        still_used = media_urls(db, others)
        files = {p for u in urls - still_used if (p := storage_path(u, DEMO_OWNER))}
        skipped = sorted(u for u in urls if u in still_used or not storage_path(u, DEMO_OWNER))
        print(f"\nStorage files to delete: {len(files)}")
        for bucket, path in sorted(files):
            print(f"    {bucket}/{path}")
        if skipped:
            print("Left alone (used elsewhere, or not in the demo owner's folder):")
            for u in skipped:
                print(f"    {u}")

        if not APPLY:
            db.rollback()
            print("\nDry run: nothing changed. Re-run with --apply to delete it.")
            return

        # ── delete, children first ────────────────────────────
        b, s = dict(b=booking_ids), dict(s=seat_ids)
        q(db, "update bookings set initiator_member_id = null where id = any(cast(:b as uuid[]))", **b)
        q(db, "update booking_participants set covered_by_member_id = null where booking_id = any(cast(:b as uuid[]))", **b)
        if table_exists(db, "live_activity_tokens"):
            q(db, "delete from live_activity_tokens where booking_id = any(cast(:b as uuid[]))", **b)
        if table_exists(db, "settlement_lines"):
            q(db, """delete from settlement_lines where booking_id = any(cast(:b as uuid[]))
                     or venue_id = any(cast(:v as uuid[]))
                     or settlement_id in (select id from settlements where venue_id = any(cast(:v as uuid[])))""",
              **b, **v)
        if table_exists(db, "settlements"):
            q(db, "delete from settlements where venue_id = any(cast(:v as uuid[]))", **v)
        q(db, "delete from booking_participants where id = any(cast(:s as uuid[]))", **s)
        q(db, "delete from bookings where id = any(cast(:b as uuid[]))", **b)
        q(db, "delete from deals where venue_id = any(cast(:v as uuid[]))", **v)
        q(db, "delete from deal_schedules where venue_id = any(cast(:v as uuid[]))", **v)
        q(db, "delete from venue_reels where venue_id = any(cast(:v as uuid[]))", **v)
        q(db, "delete from user_venue_interactions where venue_id = any(cast(:v as uuid[]))", **v)
        if table_exists(db, "merchant_documents"):
            q(db, "delete from merchant_documents where venue_id = any(cast(:v as uuid[]))", **v)
        gone = q(db, "delete from venues where id = any(cast(:v as uuid[]))", **v).rowcount
        db.commit()
        print(f"\nDatabase: removed {gone} venues and everything above.")

    if files:
        delete_storage(files)
    print("\nDone. Delete the owner@test.com login in Supabase → Authentication.")


if __name__ == "__main__":
    main()
