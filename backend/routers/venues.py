import logging
import os
import time
from datetime import date as dt_date
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import and_, exists, false, func, or_
from sqlalchemy.orm import Session, joinedload

import google_places
import stripe_client
from auth import SUPABASE_URL, get_current_user
from database import SessionLocal, get_db
from booking_logic import VENUE_TZ, pack_nights, slot_at
from deal_schedules import deal_price_for
from mailer import MailNotConfigured, MailSendFailed, send_email
from models import Booking, BookingParticipant, Deal, DealSchedule, Venue, VenueReel, UNLIMITED_SPOTS
from schemas import (
    BookedSlot,
    BookingResponse,
    DealPerformanceItem,
    DealResponse,
    PayoutLine,
    PayoutResponse,
    PayoutsResponse,
    PayoutSummary,
    PlaceLookupResponse,
    RecentBooking,
    StatsResponse,
    VenueBookingsPage,
    VenueBookingTotals,
    VenueCreate,
    VenueReelCreate,
    VenueReelItem,
    VenueResponse,
    VenueUpdate,
    VideoShootRequest,
)

router = APIRouter()
logger = logging.getLogger("impulse.venues")


def _get_venue_or_404(venue_id: str, db: Session) -> Venue:
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    return venue


def _assert_owner(venue: Venue, user: dict) -> None:
    if venue.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized for this venue")


MAX_PHOTOS = 8


def _sync_photos(fields: dict) -> None:
    """Keep image_url (the cover, all that older app builds read) equal to the
    first gallery photo. A client that only knows one photo sends image_url,
    which becomes a one-photo gallery."""
    if "image_urls" in fields and fields["image_urls"] is not None:
        urls: List[str] = []
        for u in fields["image_urls"]:
            u = (u or "").strip()
            if u and u not in urls:
                urls.append(u)
        if len(urls) > MAX_PHOTOS:
            raise HTTPException(status_code=400, detail=f"Up to {MAX_PHOTOS} photos")
        fields["image_urls"] = urls
        fields["image_url"] = urls[0] if urls else None
    elif "image_url" in fields:
        fields.pop("image_urls", None)
        cover = (fields["image_url"] or "").strip() or None
        fields["image_url"] = cover
        fields["image_urls"] = [cover] if cover else []
    else:
        fields.pop("image_urls", None)


def refresh_popular_times(venue_id: str) -> None:
    """Fetch and store Google Popular Times for the venue's linked place. Runs
    after the response, in its own session; a miss leaves what was there."""
    with SessionLocal() as db:
        venue = db.query(Venue).filter(Venue.id == venue_id).first()
        if not venue or not venue.google_place_id:
            return
        place = google_places.place_details(venue.google_place_id)
        if not place or not place.get("popular_times"):
            logger.info("No Popular Times for %s (%s)", venue.name, venue.google_place_id)
            return
        venue.popular_times = place["popular_times"]
        venue.popular_times_fetched_at = datetime.now(timezone.utc)
        db.commit()


@router.post("", response_model=VenueResponse, status_code=201)
def create_venue(
    body: VenueCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    fields = body.model_dump()
    _sync_photos(fields)
    venue = Venue(**fields, owner_id=user["sub"])
    db.add(venue)
    db.commit()
    db.refresh(venue)
    if venue.google_place_id:
        background.add_task(refresh_popular_times, venue.id)
    return venue


def _my_venues_query(db: Session, user: dict):
    """Every active venue this user owns. Ordered so the choice of "first" is
    stable — without it Postgres is free to reorder rows after any UPDATE."""
    return (
        db.query(Venue)
        .filter(Venue.owner_id == user["sub"], Venue.is_active == True)
        .order_by(Venue.created_at.asc(), Venue.name.asc(), Venue.id.asc())
    )


@router.get("/mine/all", response_model=List[VenueResponse])
def list_my_venues(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Every venue the current user owns — powers the portal's venue switcher.
    Returns [] rather than 404 so "no venues yet" is distinguishable from an
    auth or server failure on the client."""
    return _my_venues_query(db, user).all()


@router.get("/mine", response_model=VenueResponse)
def get_my_venue(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return the first active venue owned by the current user, or 404.
    Kept for compatibility — prefer /venues/mine/all."""
    venue = _my_venues_query(db, user).first()
    if not venue:
        raise HTTPException(status_code=404, detail="No venue found for this user")
    return venue


# Each lookup is a paid SerpApi search: a few per venue owner per hour is
# plenty to find their place, and caps what a stolen token could spend.
_LOOKUP_LIMIT = int(os.environ.get("PLACE_LOOKUP_LIMIT", "20"))
_lookups: Dict[str, List[float]] = {}


def _lookup_limited(user_id: str) -> bool:
    now = time.time()
    hits = [t for t in _lookups.get(user_id, []) if now - t < 3600]
    _lookups[user_id] = hits
    if len(hits) >= _LOOKUP_LIMIT:
        return True
    hits.append(now)
    return False


@router.get("/lookup", response_model=PlaceLookupResponse)
def lookup_place(
    name: str = Query(..., min_length=2, max_length=120),
    address: Optional[str] = Query(None, max_length=200),
    suburb: Optional[str] = Query(None, max_length=80),
    user: dict = Depends(get_current_user),
):
    """The venue's Google Maps place from the name and address they typed, so
    the form can offer its opening hours, phone and website."""
    if not google_places.configured():
        return PlaceLookupResponse(found=False)
    if _lookup_limited(user["sub"]):
        raise HTTPException(status_code=429, detail="Too many lookups. Try again in a little while.")
    place = google_places.find_place(name, address, suburb)
    if not place or not place.get("place_id"):
        return PlaceLookupResponse(found=False)
    return PlaceLookupResponse(
        found=True,
        has_popular_times=bool(place.get("popular_times")),
        **{k: place.get(k) for k in ("place_id", "name", "address", "phone", "website", "lat", "lng", "opening_hours")},
    )


@router.get("/{venue_id}", response_model=VenueResponse)
def get_venue(venue_id: str, db: Session = Depends(get_db)):
    return _get_venue_or_404(venue_id, db)


@router.patch("/{venue_id}", response_model=VenueResponse)
def update_venue(
    venue_id: str,
    body: VenueUpdate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    fields = body.model_dump(exclude_unset=True)
    _sync_photos(fields)
    place_changed = "google_place_id" in fields and fields["google_place_id"] != venue.google_place_id
    if place_changed:
        venue.popular_times = None
        venue.popular_times_fetched_at = None
    for key, value in fields.items():
        setattr(venue, key, value)
    db.commit()
    db.refresh(venue)
    if place_changed and venue.google_place_id:
        background.add_task(refresh_popular_times, venue.id)
    return venue


REELS_BUCKET = "venue-reels"


def _own_upload(url: Optional[str], user: dict) -> bool:
    """A public URL of a file this user uploaded to the venue-reels bucket."""
    prefix = f"{SUPABASE_URL}/storage/v1/object/public/{REELS_BUCKET}/{user['sub']}/"
    return bool(url) and url.startswith(prefix) and ".." not in url


@router.get("/{venue_id}/reels", response_model=List[VenueReelItem])
def list_venue_reels(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """The venue's own Discover videos, newest first, for reuse on a new deal."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    return (
        db.query(VenueReel)
        .filter(VenueReel.venue_id == venue_id, VenueReel.is_active == True)
        .order_by(VenueReel.created_at.desc())
        .all()
    )


@router.post("/{venue_id}/reels", response_model=VenueReelItem, status_code=201)
def create_venue_reel(
    venue_id: str,
    body: VenueReelCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Register a video the venue just uploaded to Storage. It shows in
    Discover, and can be attached to any of the venue's deals."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    if not _own_upload(body.video_url, user):
        raise HTTPException(status_code=400, detail="Upload the video from the venue portal first")
    if body.poster_url and not _own_upload(body.poster_url, user):
        raise HTTPException(status_code=400, detail="Upload the poster from the venue portal first")
    reel = VenueReel(
        venue_id=venue_id,
        video_url=body.video_url,
        poster_url=body.poster_url,
        caption=(body.caption or "").strip() or None,
    )
    db.add(reel)
    db.commit()
    db.refresh(reel)
    return reel


# Who hears about a venue asking for a complimentary video shoot.
VIDEO_SHOOT_TO: List[str] = [
    a.strip() for a in os.environ.get("VIDEO_SHOOT_TO", "rahul@impulseapp.au").split(",") if a.strip()
]
_WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _price(x, unit: Optional[str]) -> str:
    unit = unit or "pp"
    money = f"${float(x):,.2f}".replace(".00", "")
    return money + unit if unit.startswith("/") else f"{money} {unit}"


def _video_shoot_email(venue: Venue, user: dict, deal: Optional[Deal], schedule: Optional[DealSchedule]) -> str:
    lines = [
        f"{venue.name} would like a complimentary video shot by the Impulse media team.",
        "",
        "Venue",
        f"  Name:     {venue.name}",
        f"  Address:  {', '.join(p for p in (venue.address, venue.suburb) if p) or '-'}",
        f"  Phone:    {venue.phone or '-'}",
        f"  Email:    {venue.email or '-'}",
        f"  Website:  {venue.website or '-'}",
        f"  Login:    {user.get('email') or '-'}",
        f"  Venue ID: {venue.id}",
    ]
    if deal:
        lines += ["", "Deal they just published",
                  f"  {deal.title}",
                  f"  {_price(deal.deal_price, deal.unit)} (usually {_price(deal.original_price, deal.unit)})",
                  f"  {deal.date} · {', '.join(deal.slots or [])}",
                  f"  {'Live' if deal.is_active else 'Draft'} · Deal ID {deal.id}"]
    if schedule:
        days = ", ".join(_WEEKDAYS[d] for d in sorted(schedule.weekdays or []))
        span = f"from {schedule.starts_on}" + (f" to {schedule.ends_on}" if schedule.ends_on else ", every week")
        lines += ["", "Deal they just published (repeating)",
                  f"  {schedule.title}",
                  f"  {_price(deal_price_for(schedule.original_price, schedule.discount_pct), schedule.unit)}"
                  f" (usually {_price(schedule.original_price, schedule.unit)})",
                  f"  {days} {span} · {', '.join(schedule.slots or [])}",
                  f"  {'Live' if schedule.is_active else 'Draft'} · Schedule ID {schedule.id}"]
    lines += ["", "Reply to this email to reach the venue's login address."]
    return "\n".join(lines)


@router.post("/{venue_id}/video-shoot", status_code=202)
def request_video_shoot(
    venue_id: str,
    body: VideoShootRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """The venue ticked "get a complimentary video shot by the Impulse media
    team" on a deal. One per venue: it emails VIDEO_SHOOT_TO and records the
    time, after which the portal stops offering it. A failed send records
    nothing (so they can ask again) and is a 502, logged in full."""
    # Locked so two tabs publishing at once can't both send.
    venue = db.query(Venue).filter(Venue.id == venue_id).with_for_update().first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    _assert_owner(venue, user)
    if venue.video_shoot_requested_at:
        raise HTTPException(status_code=409, detail="You've already asked for your video shoot. We'll be in touch.")
    deal = schedule = None
    if body.deal_id:
        deal = db.query(Deal).filter(Deal.id == body.deal_id, Deal.venue_id == venue_id).first()
        if not deal:
            raise HTTPException(status_code=404, detail="Deal not found")
    if body.schedule_id:
        schedule = (db.query(DealSchedule)
                    .filter(DealSchedule.id == body.schedule_id, DealSchedule.venue_id == venue_id).first())
        if not schedule:
            raise HTTPException(status_code=404, detail="Deal not found")

    subject = f"Video shoot request: {venue.name}"
    text = _video_shoot_email(venue, user, deal, schedule)
    try:
        send_email(VIDEO_SHOOT_TO, subject, text, reply_to=user.get("email"))
    except (MailNotConfigured, MailSendFailed) as e:
        db.rollback()
        logger.error("Video shoot request not emailed (%s):\n%s", e, text)
        raise HTTPException(status_code=502, detail="Couldn't send the video request.")
    venue.video_shoot_requested_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "sent"}


@router.delete("/{venue_id}", status_code=204)
def deactivate_venue(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    venue.is_active = False
    db.commit()


@router.get("/{venue_id}/deals", response_model=List[DealResponse])
def list_venue_deals(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: all deals for a venue (events management screen)."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    return (
        db.query(Deal)
        .filter(Deal.venue_id == venue_id)
        .order_by(Deal.created_at.desc())
        .all()
    )


DEAD_STATUSES = ("cancelled", "expired", "collapsed", "no_show")
# A booking row exists from the moment someone taps claim ("collecting"), long
# before any card is held. Only these went through: the hold is on the card and
# the code is issued (confirmed), or it was charged at check-in (redeemed).
PAID_STATUSES = ("confirmed", "redeemed")


def _venue_today_utc_bounds() -> tuple:
    """Start and end of today in the venue's timezone, as UTC instants. The
    server runs in UTC, so a plain date.today() is yesterday until 11am Sydney."""
    today = datetime.now(VENUE_TZ).date()
    start = datetime.combine(today, datetime.min.time(), tzinfo=VENUE_TZ)
    end = datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=VENUE_TZ)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


@router.get("/{venue_id}/bookings/recent", response_model=List[RecentBooking])
def recent_venue_bookings(
    venue_id: str,
    limit: int = Query(4, ge=1, le=50),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: the newest bookings across every deal, for the dashboard. One
    query — the dashboard used to ask once per deal, which drained the
    connection pool once weekly schedules multiplied the deals."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    rows = (
        db.query(Booking, Deal.title)
        .join(Deal, Deal.id == Booking.deal_id)
        .filter(Deal.venue_id == venue_id, Booking.status.in_(PAID_STATUSES))
        .order_by(Booking.created_at.desc())
        .limit(limit)
        .all()
    )
    return [RecentBooking.model_validate({**BookingResponse.model_validate(b).model_dump(), "deal_title": title})
            for b, title in rows]


@router.get("/{venue_id}/booked-slots", response_model=List[BookedSlot])
def venue_booked_slots(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: every booking that went ahead (confirmed or redeemed), reduced to
    when and how many — what the new-deal composer charts busy times from."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    rows = (
        db.query(Deal.deal_date, Booking.slot_time, Booking.num_people, Booking.created_at)
        .join(Deal, Deal.id == Booking.deal_id)
        .filter(Deal.venue_id == venue_id, Booking.status.in_(("confirmed", "redeemed")))
        .all()
    )
    return [BookedSlot(deal_date=d, slot_time=s, num_people=n, created_at=c) for d, s, n, c in rows]


@router.get("/{venue_id}/bookings", response_model=VenueBookingsPage)
def list_venue_bookings(
    venue_id: str,
    view: Literal["upcoming", "past"] = "upcoming",
    date_from: Optional[dt_date] = None,
    date_to: Optional[dt_date] = None,
    deal: Optional[str] = Query(None, description="Deal title — every night a weekly deal ran"),
    deal_id: Optional[str] = None,
    status: Literal["all", "redeemed", "confirmed", "pending", "dead", "followup"] = "all",
    q: Optional[str] = Query(None, description="Part of a confirmation code; searches every booking, ignoring the other filters"),
    sort: Literal["newest", "oldest"] = "newest",
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: one page of the venue's bookings, filtered, with totals across
    every page. Pages hold whole nights (a deal's evening), never half of one."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)

    today = datetime.now(VENUE_TZ).date()
    # A legacy deal with no date counts as upcoming while it's still active.
    upcoming = or_(Deal.deal_date >= today, and_(Deal.deal_date.is_(None), Deal.is_active.is_(True)))
    past = or_(Deal.deal_date < today, and_(Deal.deal_date.is_(None), Deal.is_active.is_(False)))
    in_view = upcoming if view == "upcoming" else past
    followup = exists().where(
        BookingParticipant.booking_id == Booking.id, BookingParticipant.payment_followup.is_(True))

    base = db.query(Booking).join(Deal, Deal.id == Booking.deal_id).filter(Deal.venue_id == venue_id)
    code = "".join(c for c in (q or "") if c.isdigit())
    if code:
        base = base.filter(Booking.confirmation_code.contains(code))
    else:
        base = base.filter(in_view)
        if deal_id:
            base = base.filter(Deal.id == deal_id)
        if deal:
            base = base.filter(Deal.title == deal)
        if date_from or date_to:
            base = base.filter(Deal.deal_date.isnot(None))
            if date_from:
                base = base.filter(Deal.deal_date >= date_from)
            if date_to:
                base = base.filter(Deal.deal_date <= date_to)
        if status == "redeemed":
            base = base.filter(Booking.status == "redeemed")
        elif status == "confirmed":
            base = base.filter(Booking.status == "confirmed")
        elif status == "pending":
            base = base.filter(Booking.status.in_(("voting", "collecting")))
        elif status == "dead":
            base = base.filter(Booking.status.in_(DEAD_STATUSES))
        elif status == "followup":
            base = base.filter(followup)

    live = Booking.status.notin_(DEAD_STATUSES)
    t = base.with_entities(
        func.count().filter(live),
        func.coalesce(func.sum(Booking.num_people).filter(live), 0),
        func.coalesce(func.sum(Booking.total_paid).filter(live), 0),
        func.count().filter(Booking.status == "redeemed"),
        func.count().filter(Booking.status.in_(("redeemed", "confirmed"))),
        func.count().filter(followup),
    ).one()
    totals = VenueBookingTotals(
        bookings=t[0], guests=t[1], revenue=float(t[2]), redeemed=t[3], redeemable=t[4], followups=t[5])

    deal_titles = [
        title for (title,) in db.query(Deal.title)
        .filter(Deal.venue_id == venue_id, in_view).distinct().order_by(Deal.title).all()
    ]

    night_order = (Deal.deal_date.asc() if sort == "oldest" else Deal.deal_date.desc()).nulls_last()
    counts = (
        base.with_entities(Deal.deal_date, func.count())
        .group_by(Deal.deal_date).order_by(night_order).all()
    )
    pages = pack_nights([(night, n) for night, n in counts])
    page = min(page, max(1, len(pages)))
    nights = pages[page - 1] if pages else []

    bookings: List[Booking] = []
    if nights:
        dated = [n for n in nights if n is not None]
        bookings = (
            base.filter(or_(Deal.deal_date.in_(dated), Deal.deal_date.is_(None) if None in nights else false()))
            .options(joinedload(Booking.participants))
            .order_by(Booking.created_at.desc())
            .all()
        )
    deal_ids = {b.deal_id for b in bookings}
    deals = db.query(Deal).filter(Deal.id.in_(deal_ids)).all() if deal_ids else []

    return VenueBookingsPage(
        # A group booking needs following up if any seat's charge declined.
        bookings=[
            BookingResponse.model_validate(b).model_copy(update={
                **BookingResponse.seat_fields(b, None),
                "payment_followup": any(p.payment_followup for p in b.participants),
            })
            for b in bookings
        ],
        deals=[DealResponse.model_validate(d) for d in deals],
        page=page,
        pages=max(1, len(pages)),
        totals=totals,
        deal_titles=deal_titles,
    )


def _ts(value) -> Optional[datetime]:
    return datetime.fromtimestamp(int(value), tz=timezone.utc) if value else None


@router.get("/{venue_id}/payouts", response_model=PayoutsResponse)
def get_payouts(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: money paid out from the venue's Stripe account to its bank,
    newest first, each with the redeemed bookings that triggered it."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    empty = PayoutsResponse(summary=PayoutSummary(
        paid_cents=0, in_transit_cents=0, awaiting_cents=0, payout_count=0, last_payout_date=None,
    ), payouts=[])
    if not venue.stripe_account_id:
        return empty
    try:
        stripe_payouts = stripe_client.list_payouts(venue.stripe_account_id)
        balance = stripe_client.retrieve_balance(venue.stripe_account_id)
    except stripe_client.StripeError as e:
        logger.error("Reading payouts for venue %s failed: %s", venue_id, e)
        raise HTTPException(status_code=502, detail="Couldn't load payouts. Try again.")

    payout_ids = [p["id"] for p in stripe_payouts]
    by_payout: dict = {}
    if payout_ids:
        rows = (
            db.query(Booking, Deal.title)
            .join(Deal, Deal.id == Booking.deal_id)
            .filter(Booking.stripe_payout_id.in_(payout_ids))
            .all()
        )
        for b, title in rows:
            by_payout.setdefault(b.stripe_payout_id, []).append(PayoutLine(
                booking_id=b.id, confirmation_code=b.confirmation_code, deal_title=title,
                amount_cents=b.locked_price_cents or 0, redeemed_at=b.redeemed_at,
            ))

    payouts = [
        PayoutResponse(
            id=p["id"], status=p.get("status") or "pending", method=p.get("method") or "standard",
            currency=p.get("currency") or "aud", amount_cents=p.get("amount") or 0,
            arrival_date=_ts(p.get("arrival_date")), created=_ts(p.get("created")),
            lines=by_payout.get(p["id"], []),
        )
        for p in stripe_payouts
    ]
    aud = lambda entries: sum(e.get("amount") or 0 for e in (entries or []) if e.get("currency") == "aud")
    return PayoutsResponse(
        summary=PayoutSummary(
            paid_cents=sum(p.amount_cents for p in payouts if p.status == "paid"),
            in_transit_cents=sum(p.amount_cents for p in payouts if p.status in ("pending", "in_transit")),
            awaiting_cents=aud(balance.get("available")) + aud(balance.get("pending")),
            payout_count=len(payouts),
            last_payout_date=payouts[0].arrival_date if payouts else None,
        ),
        payouts=payouts,
    )


@router.get("/{venue_id}/stats", response_model=StatsResponse)
def get_stats(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: dashboard stats for a venue."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)

    active_deals_q = db.query(Deal).filter(
        Deal.venue_id == venue_id, Deal.is_active == True
    )
    active_deals_count = active_deals_q.count()

    deal_ids = [
        row.id
        for row in db.query(Deal.id).filter(Deal.venue_id == venue_id).all()
    ]

    day_start, day_end = _venue_today_utc_bounds()
    today_bookings = (
        db.query(Booking)
        .filter(
            Booking.deal_id.in_(deal_ids),
            Booking.status.in_(PAID_STATUSES),
            Booking.created_at >= day_start,
            Booking.created_at < day_end,
        )
        .all()
        if deal_ids
        else []
    )

    active_deal_rows = active_deals_q.all()
    # An unlimited deal has no capacity to fill, so it counts only the spots it
    # has taken; otherwise one would swamp the venue's capacity figure.
    spots_filled = sum(d.total_spots - d.spots_remaining for d in active_deal_rows)
    total_spots = sum(
        d.total_spots - d.spots_remaining if d.total_spots >= UNLIMITED_SPOTS else d.total_spots
        for d in active_deal_rows
    )

    return StatsResponse(
        active_deals=active_deals_count,
        bookings_today=len(today_bookings),
        revenue_today=round(sum(b.total_paid for b in today_bookings), 2),
        spots_filled=spots_filled,
        total_spots=total_spots,
    )


def _deal_ended_at(deal: Deal) -> Optional[datetime]:
    """When the deal finished running: its last slot (read in the venue's
    time zone), else expires_at."""
    slot_times = [t for s in (deal.slots or []) if (t := slot_at(deal.date, s))]
    ended = max(slot_times) if slot_times else deal.expires_at
    if ended is None:
        return None
    return ended if ended.tzinfo else ended.replace(tzinfo=timezone.utc)


@router.get("/{venue_id}/deal-performance", response_model=List[DealPerformanceItem])
def get_deal_performance(
    venue_id: str,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Admin: how the venue's finished deals actually sold — fill rate and how
    long each took to draw its last booking. Newest first."""
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)

    now = datetime.now(timezone.utc)
    completed: List[Deal] = []
    for deal in (
        db.query(Deal)
        .filter(Deal.venue_id == venue_id)
        .order_by(Deal.created_at.desc())
        .all()
    ):
        ended = _deal_ended_at(deal)
        if ended is not None and ended <= now:
            completed.append(deal)
        if len(completed) == limit:
            break

    if not completed:
        return []

    # Cancelled bookings release their spots, so they don't count as demand.
    booking_rows = (
        db.query(
            Booking.deal_id,
            func.count(Booking.id),
            func.max(Booking.created_at),
        )
        .filter(
            Booking.deal_id.in_([d.id for d in completed]),
            Booking.status != "cancelled",
        )
        .group_by(Booking.deal_id)
        .all()
    )
    by_deal = {deal_id: (count, last) for deal_id, count, last in booking_rows}

    items = []
    for deal in completed:
        bookings, last_booking_at = by_deal.get(deal.id, (0, None))
        filled = deal.total_spots - deal.spots_remaining

        minutes = None
        if last_booking_at is not None:
            live_at = deal.created_at
            if live_at.tzinfo is None:
                live_at = live_at.replace(tzinfo=timezone.utc)
            if last_booking_at.tzinfo is None:
                last_booking_at = last_booking_at.replace(tzinfo=timezone.utc)
            minutes = max(0, round((last_booking_at - live_at).total_seconds() / 60))

        items.append(
            DealPerformanceItem(
                deal_id=deal.id,
                title=deal.title,
                category=deal.category,
                discount_pct=float(deal.discount_pct),
                date=deal.date,
                slots=deal.slots or [],
                total_spots=deal.total_spots,
                spots_filled=filled,
                fill_rate=round(filled / deal.total_spots * 100, 1) if deal.total_spots else 0.0,
                bookings=bookings,
                minutes_to_last_booking=minutes,
            )
        )
    return items
