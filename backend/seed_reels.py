"""
Give each demo venue a Discover reel: uploads a placeholder clip + poster to
the public `venue-reels` Storage bucket and adds a venue_reels row.

The clips are free-licensed stock (Mixkit / Pexels — commercial use, no
attribution), not real customer content; each row's source_url records where
its clip came from so they're easy to find and replace before launch. Files
live in mobile-sdk54/assets/demo-reels/<slug>.mp4 / .jpg.

Idempotent: a venue that already has a reel is skipped.

Usage:
    uv run python seed_reels.py --owner-id <uuid> [--dry-run]

    --owner-id   Only touch venues owned by this user (required)
    --dry-run    Print what would change without uploading or writing
"""

import argparse
import os
from pathlib import Path

import httpx

from auth import SUPABASE_URL
from database import SessionLocal
from models import Venue, VenueReel

BUCKET = "venue-reels"
ASSETS = Path(__file__).resolve().parent.parent / "mobile-sdk54" / "assets" / "demo-reels"

# venue name → (file slug, caption, where the stock clip came from)
REELS = {
    "Kingpin Lanes": ("kingpin-lanes", "Lane's open. Bring the crew.",
                      "https://mixkit.co/free-stock-video/young-man-at-the-bowling-center-makes-a-shot-49114/"),
    "Echo Chamber Karaoke": ("echo-chamber", "Private rooms, your playlist, zero shame.",
                             "https://www.pexels.com/video/people-singing-together-9005696/"),
    "Blacklight Putt": ("blacklight-putt", "18 holes, one bragging right.",
                        "https://www.pexels.com/video/a-woman-putting-a-golf-ball-6533031/"),
    "Corner Pocket": ("corner-pocket", "Call your shot.",
                      "https://www.pexels.com/video/a-group-of-friends-playing-pool-10868857/"),
    "Laugh Track": ("laugh-track", "New material every night.",
                    "https://www.pexels.com/video/man-smiling-while-holding-the-microphone-8117113/"),
    "Low Frequency": ("low-frequency", "Doors at nine. Bass till late.",
                      "https://www.pexels.com/video/dj-playing-music-in-a-dark-room-with-red-lights-20612351/"),
    "The Vault Escape": ("vault-escape", "60 minutes. One way out.",
                         "https://www.pexels.com/video/friends-entering-a-room-together-8128206/"),
    "The Lantern Room": ("lantern-room", "Low light, stirred not shaken.",
                         "https://www.pexels.com/video/a-bartender-making-a-cocktail-drink-7608984/"),
}


def _headers() -> dict:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _ensure_bucket() -> None:
    r = httpx.post(f"{SUPABASE_URL}/storage/v1/bucket", headers=_headers(),
                   json={"id": BUCKET, "name": BUCKET, "public": True})
    # Already there is fine; Storage reports it as 400/409 "already exists".
    if r.status_code >= 400 and "already exists" not in r.text.lower():
        r.raise_for_status()


def _upload(path: str, file: Path, content_type: str) -> str:
    r = httpx.post(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",
        headers={**_headers(), "Content-Type": content_type, "x-upsert": "true"},
        content=file.read_bytes(),
        timeout=120,
    )
    r.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner-id", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        venues = db.query(Venue).filter(Venue.owner_id == args.owner_id, Venue.name.in_(REELS)).all()
        missing = set(REELS) - {v.name for v in venues}
        if missing:
            print(f"Not found for this owner (skipped): {', '.join(sorted(missing))}")
        if not args.dry_run and venues:
            _ensure_bucket()

        for order, v in enumerate(sorted(venues, key=lambda v: list(REELS).index(v.name))):
            if db.query(VenueReel).filter(VenueReel.venue_id == v.id).first():
                print(f"{v.name}: already has a reel, skipped")
                continue
            slug, caption, source = REELS[v.name]
            video, poster = ASSETS / f"{slug}.mp4", ASSETS / f"{slug}.jpg"
            if args.dry_run:
                print(f"{v.name}: would upload {video.name} + {poster.name}")
                continue
            folder = f"{args.owner_id}/{v.id}"
            db.add(VenueReel(
                venue_id=v.id,
                video_url=_upload(f"{folder}/{slug}.mp4", video, "video/mp4"),
                poster_url=_upload(f"{folder}/{slug}.jpg", poster, "image/jpeg"),
                caption=caption,
                source_url=source,
                sort_order=order,
            ))
            db.commit()
            print(f"{v.name}: reel added")
    finally:
        db.close()


if __name__ == "__main__":
    main()
