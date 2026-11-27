"""Full-price booking: every venue in the feed, deal or not.

A venue's standard offer is what it sells at its usual price ("Bowling lane,
$40 pp"). It's stored as a DealSchedule flagged is_standard (one per venue)
and turned into a 0%-off Deal each day the venue is open, with a slot each
hour of that day's opening hours, so booking, paying, splitting and redeeming
work exactly as for deals. The app shows it only when the venue has no deal.

GET /venues/browse lists every active venue for the feed, so venues with
nothing bookable still show (browse-only). Mounted before the venues router
so /venues/browse isn't read as a venue id.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user, get_optional_user
from database import get_db
from deal_schedules import SYDNEY, deal_price_for, generate_scheduled_deals, standard_slots
from demo_mode import hide_demo_venues
from environment import can_manage_venue
from models import Deal, DealSchedule, Venue, VenueReel
from opening_hours import week_hours
from routers.deals import check_reel, title_fields
from routers.merchants import can_publish_deals
from schemas import BrowseVenue, StandardOfferInput, StandardOfferResponse, gallery

router = APIRouter()


@router.get("/browse", response_model=List[BrowseVenue])
def browse_venues(db: Session = Depends(get_db), user: Optional[dict] = Depends(get_optional_user)):
    """Public: every active venue, with its first video. The app merges this
    with GET /deals to show venues that have nothing bookable."""
    venues = hide_demo_venues(db.query(Venue).filter(Venue.is_active == True), db, user).order_by(Venue.name).all()  # noqa: E712
    reels = {}
    if venues:
        for r in (
            db.query(VenueReel)
            .filter(VenueReel.venue_id.in_([v.id for v in venues]), VenueReel.is_active == True)  # noqa: E712
            .order_by(VenueReel.sort_order, VenueReel.created_at.desc())
        ):
            reels.setdefault(r.venue_id, r)
    return [
        BrowseVenue(
            id=v.id, name=v.name, category=v.category, description=v.description,
            address=v.address, suburb=v.suburb, lat=v.lat, lng=v.lng,
            opening_hours=v.opening_hours, avg_rating=float(v.avg_rating or 0),
            image_url=v.image_url, image_urls=gallery(v),
            accessibility_features=v.accessibility_features or [],
            reel_video_url=reels[v.id].video_url if v.id in reels else None,
            reel_poster_url=reels[v.id].poster_url if v.id in reels else None,
        )
        for v in venues
    ]


def _owned_venue(venue_id: str, user: dict, db: Session) -> Venue:
    venue = db.query(Venue).filter(Venue.id == venue_id, Venue.is_active == True).first()  # noqa: E712
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    if not can_manage_venue(venue.owner_id, user):
        raise HTTPException(status_code=403, detail="Not authorized for this venue")
    return venue


def _offer(db: Session, venue_id: str) -> Optional[DealSchedule]:
    return (
        db.query(DealSchedule)
        .filter(DealSchedule.venue_id == venue_id, DealSchedule.is_standard == True)  # noqa: E712
        .first()
    )


def _today(db: Session, offer: DealSchedule) -> Optional[Deal]:
    today = datetime.now(SYDNEY).date()
    return db.query(Deal).filter(Deal.schedule_id == offer.id, Deal.deal_date == today).first()


def _response(offer: DealSchedule, venue: Venue) -> StandardOfferResponse:
    hours = week_hours(venue.opening_hours)
    return StandardOfferResponse(
        id=offer.id, venue_id=offer.venue_id, title=offer.title, auto_title=bool(offer.auto_title),
        description=offer.description, unit=offer.unit, original_price=float(offer.original_price),
        max_group_size=offer.max_group_size, total_spots=offer.total_spots, reel_id=offer.reel_id,
        is_active=offer.is_active,
        slots_today=standard_slots(venue, datetime.now(SYDNEY).date()),
        hours_set=any(h is not None for h in hours.values()),
        payments_ready=can_publish_deals(venue),
    )


@router.get("/{venue_id}/standard-offer", response_model=Optional[StandardOfferResponse])
def get_standard_offer(venue_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """The venue's standard offer, or null if it hasn't set one."""
    venue = _owned_venue(venue_id, user, db)
    offer = _offer(db, venue.id)
    return _response(offer, venue) if offer else None


@router.put("/{venue_id}/standard-offer", response_model=StandardOfferResponse)
def put_standard_offer(
    venue_id: str, body: StandardOfferInput,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    """Create or replace the standard offer. Today's full-price deal follows
    straight away: a booking already made keeps the price it locked."""
    venue = _owned_venue(venue_id, user, db)
    check_reel(db, venue.id, body.reel_id)
    fields = body.model_dump()
    fields.update(title_fields(body.title, venue, body.original_price, body.unit))
    fields.update(
        category=venue.category, discount_pct=0, price_drops=None, slots=[],
        weekdays=list(range(7)), starts_on=None, ends_on=None,
    )
    offer = _offer(db, venue.id)
    if offer is None:
        offer = DealSchedule(venue_id=venue.id, is_standard=True, **fields)
        db.add(offer)
    else:
        for key, value in fields.items():
            setattr(offer, key, value)

    today = _today(db, offer) if offer.id else None
    if today is not None:
        _sync_today(today, offer)
    db.commit()
    generate_scheduled_deals(db, venue_id=venue.id)
    db.refresh(offer)
    return _response(offer, venue)


def _sync_today(deal: Deal, offer: DealSchedule) -> None:
    """Carry an edit onto today's deal. Spots already taken stay taken."""
    taken = deal.total_spots - deal.spots_remaining
    deal.title = offer.title
    deal.auto_title = offer.auto_title
    deal.description = offer.description
    deal.unit = offer.unit
    deal.reel_id = offer.reel_id
    deal.original_price = offer.original_price
    deal.deal_price = deal_price_for(offer.original_price, 0)
    deal.max_group_size = offer.max_group_size
    deal.total_spots = offer.total_spots
    deal.spots_remaining = max(0, offer.total_spots - taken)
    deal.is_active = offer.is_active


@router.delete("/{venue_id}/standard-offer", status_code=204)
def delete_standard_offer(venue_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Stop full-price booking. Today's deal is switched off; bookings already
    made keep it."""
    venue = _owned_venue(venue_id, user, db)
    offer = _offer(db, venue.id)
    if offer is None:
        return
    today = _today(db, offer)
    if today is not None:
        today.is_active = False
    db.delete(offer)
    db.commit()
