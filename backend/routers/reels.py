from typing import Dict, Iterable, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Deal, Venue, VenueReel
from schemas import ReelResponse

router = APIRouter()


def newest_live_deal_by_venue(deals: Iterable[Deal]) -> Dict[str, Deal]:
    """One deal per venue — the newest live one — for a reel's Book button.
    'Live' matches the deals feed: active with spots left."""
    best: Dict[str, Deal] = {}
    for d in deals:
        if not d.is_active or d.spots_remaining <= 0:
            continue
        cur = best.get(d.venue_id)
        if cur is None or d.created_at > cur.created_at:
            best[d.venue_id] = d
    return best


@router.get("", response_model=List[ReelResponse])
def list_reels(db: Session = Depends(get_db)):
    """Public: the Discover feed — active reels of active venues, each with
    its venue's live deal when there is one."""
    reels = (
        db.query(VenueReel)
        .options(joinedload(VenueReel.venue))
        .join(Venue, VenueReel.venue_id == Venue.id)
        .filter(VenueReel.is_active == True, Venue.is_active == True)
        .order_by(VenueReel.sort_order, VenueReel.created_at.desc())
        .all()
    )
    venue_ids = {r.venue_id for r in reels}
    deals = (
        db.query(Deal)
        .filter(Deal.venue_id.in_(venue_ids), Deal.is_active == True, Deal.spots_remaining > 0)
        .all()
    ) if venue_ids else []
    live = newest_live_deal_by_venue(deals)
    return [ReelResponse.from_reel(r, live.get(r.venue_id)) for r in reels]
