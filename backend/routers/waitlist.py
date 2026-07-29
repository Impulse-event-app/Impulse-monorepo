"""Pre-launch waitlist — anonymous signups from the landing page.

No auth anywhere in this router. Three public endpoints (signup, live count,
referrer-name lookup for the invite banner) and one endpoint gated by a static
API key from the environment, used for pitch numbers.

Position model
--------------
A member's base rank is their position by created_at ascending. Their displayed
position is that base minus referral_count, floored at 1 — so recruiting moves
you up past people who joined before you. Only the referrer's stored position is
recomputed on a referred signup; nobody else's row is touched, which keeps a
signup to a bounded number of writes no matter how long the list gets.
"""
import logging
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import and_, func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import Waitlist
from schemas import (
    WaitlistCountResponse,
    WaitlistCreate,
    WaitlistEntryResponse,
    WaitlistReferrerResponse,
    WaitlistStatsResponse,
    WaitlistTopReferrer,
)

router = APIRouter()
logger = logging.getLogger("impulse.waitlist")

# Unambiguous alphabet — no 0/O/1/I, because these codes get read aloud, texted,
# and retyped. 32^8 ≈ 1.1e12, so collisions are vanishingly rare; we retry anyway.
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_referral_code(db: Session) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
        exists = db.query(Waitlist.id).filter(Waitlist.referral_code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=503, detail="Could not allocate a referral code")


def _base_rank(db: Session, entry: Waitlist) -> int:
    """1-indexed rank by created_at ascending, id breaking exact ties. Counts
    rows at or before this entry against the (created_at, id) index.

    Written as explicit column comparisons rather than a `tuple_(...) <=
    tuple_(...)` row comparison: tuple_ drops the column's type when binding the
    right-hand side, so the id went across as VARCHAR and Postgres rejected
    `uuid <= character varying`. Comparing the column directly keeps its type.
    """
    return (
        db.query(func.count(Waitlist.id))
        .filter(
            or_(
                Waitlist.created_at < entry.created_at,
                and_(
                    Waitlist.created_at == entry.created_at,
                    Waitlist.id <= entry.id,
                ),
            )
        )
        .scalar()
    ) or 1


def _position_for(db: Session, entry: Waitlist) -> int:
    return max(1, _base_rank(db, entry) - (entry.referral_count or 0))


def _find_by_code(db: Session, code: Optional[str]) -> Optional[Waitlist]:
    if not code:
        return None
    cleaned = code.strip().upper()[:32]
    if not cleaned:
        return None
    return db.query(Waitlist).filter(Waitlist.referral_code == cleaned).first()


def _entry_response(entry: Waitlist, already: bool = False) -> WaitlistEntryResponse:
    return WaitlistEntryResponse(
        name=entry.name,
        position=entry.position or 1,
        referral_code=entry.referral_code,
        referral_count=entry.referral_count or 0,
        already_on_list=already,
    )


# ── Public endpoints ──────────────────────────────────────────────────────────

@router.get("/count", response_model=WaitlistCountResponse)
def waitlist_count(db: Session = Depends(get_db)):
    """Live counter above the form. Called once on page load, never polled."""
    return WaitlistCountResponse(count=db.query(func.count(Waitlist.id)).scalar() or 0)


@router.get("/referrer/{code}", response_model=WaitlistReferrerResponse)
def waitlist_referrer(code: str, db: Session = Depends(get_db)):
    """Resolve ?ref= to a display name for the invite banner. 404 when the code
    is unknown — the landing page treats that as "no banner" and moves on."""
    referrer = _find_by_code(db, code)
    if not referrer:
        raise HTTPException(status_code=404, detail="Unknown referral code")
    # First name only. Codes are guessable in principle; don't leak full names.
    return WaitlistReferrerResponse(name=referrer.name.strip().split(" ")[0][:40])


@router.post("", response_model=WaitlistEntryResponse, status_code=201)
def join_waitlist(
    body: WaitlistCreate,
    db: Session = Depends(get_db),
):
    """Join the waitlist.

    - 201: joined, returns position + referral code
    - 409: email already on the list — the detail carries that entry's position
      and code, so the page can show "You're already on the list!" alongside
      their real referral link instead of a dead end
    """
    email = body.email.strip().lower()
    name = body.name.strip()

    existing = db.query(Waitlist).filter(func.lower(Waitlist.email) == email).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=_entry_response(existing, already=True).model_dump(),
        )

    # An unknown ?ref= is ignored silently rather than rejected — the signup is
    # far more valuable than the attribution.
    referrer = _find_by_code(db, body.referred_by)
    if body.referred_by and not referrer:
        logger.info("Waitlist signup carried an unknown ref code %r — ignoring", body.referred_by)

    entry = Waitlist(
        name=name,
        email=email,
        preferred_activities=body.preferred_activities,
        other_activity=body.other_activity,
        area=body.area,
        referral_code=_generate_referral_code(db),
        referred_by=referrer.referral_code if referrer else None,
        referral_count=0,
    )
    db.add(entry)

    try:
        # Flush to materialise the server-side created_at and id that the rank
        # query needs; still inside the transaction.
        db.flush()
        db.refresh(entry)
        entry.position = _position_for(db, entry)

        if referrer:
            referrer.referral_count = (referrer.referral_count or 0) + 1
            referrer.position = _position_for(db, referrer)

        db.commit()
    except IntegrityError:
        # Concurrent signup won the unique-email race. Return their entry.
        db.rollback()
        raced = db.query(Waitlist).filter(func.lower(Waitlist.email) == email).first()
        if raced:
            raise HTTPException(
                status_code=409,
                detail=_entry_response(raced, already=True).model_dump(),
            )
        raise HTTPException(status_code=409, detail="Could not join the waitlist")

    db.refresh(entry)
    logger.info(
        "Waitlist signup %s at position %s (activities=%s, other=%r, area=%s, referred_by=%s)",
        entry.referral_code, entry.position, entry.preferred_activities,
        entry.other_activity, entry.area, entry.referred_by,
    )
    return _entry_response(entry)


# ── Stats (API key) ───────────────────────────────────────────────────────────

def _require_stats_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> None:
    expected = os.environ.get("WAITLIST_STATS_API_KEY")
    if not expected:
        # Unset means unavailable, never means open.
        raise HTTPException(status_code=503, detail="Stats endpoint is not configured")
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.get("/stats", response_model=WaitlistStatsResponse,
            dependencies=[Depends(_require_stats_key)])
def waitlist_stats(db: Session = Depends(get_db)):
    """Pitch numbers. Requires X-API-Key matching WAITLIST_STATS_API_KEY.

    Returns no emails — names appear only in the top-referrer list.
    """
    total = db.query(func.count(Waitlist.id)).scalar() or 0

    # Multi-select: unnest the array so one person contributes to every activity
    # they picked. These counts intentionally sum to more than `total`.
    by_activity = {
        row[0]: row[1]
        for row in db.execute(text(
            "select a, count(*) from waitlist, unnest(preferred_activities) a "
            "group by a order by count(*) desc, a asc"
        )).all()
    }
    # The long tail people typed themselves, folded case-insensitively so
    # "axe throwing" and "Axe Throwing" don't split the count. The label shown
    # is the first spelling submitted — min() would pick by collation order,
    # which is case-blind here and would surface arbitrary capitalisation.
    other_activities = {
        row[0]: row[1]
        for row in db.execute(text(
            "select (array_agg(other_activity order by created_at))[1] as label, "
            "       count(*) as n "
            "from waitlist "
            "where other_activity is not null and btrim(other_activity) <> '' "
            "group by lower(btrim(other_activity)) "
            "order by n desc, label asc"
        )).all()
    }
    by_area = {
        row[0]: row[1]
        for row in db.query(Waitlist.area, func.count(Waitlist.id))
        .group_by(Waitlist.area)
        .order_by(func.count(Waitlist.id).desc())
        .all()
    }
    top = (
        db.query(Waitlist)
        .filter(Waitlist.referral_count > 0)
        .order_by(Waitlist.referral_count.desc(), Waitlist.created_at.asc())
        .limit(10)
        .all()
    )

    return WaitlistStatsResponse(
        total=total,
        by_preferred_activity=by_activity,
        other_activities=other_activities,
        by_area=by_area,
        top_referrers=[
            WaitlistTopReferrer(
                name=e.name,
                referral_code=e.referral_code,
                referral_count=e.referral_count or 0,
                position=e.position,
            )
            for e in top
        ],
    )
