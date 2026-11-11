from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user
from database import get_db
from deal_schedules import SYDNEY, auto_title, date_label, deal_price_for, expires_for
from models import Deal, Venue, VenueReel
from routers.merchants import can_publish_deals
from schemas import DealCreate, DealResponse, DealUpdate, DealWithVenueResponse

router = APIRouter()


def _get_deal_or_404(deal_id: str, db: Session) -> Deal:
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


def _assert_deal_owner(deal: Deal, user: dict, db: Session) -> None:
    venue = db.query(Venue).filter(Venue.id == deal.venue_id).first()
    if not venue or venue.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized for this deal")


def _assert_can_publish(venue: Venue) -> None:
    """A published deal takes holds on guests' cards, so the venue's Stripe
    account must be able to receive the money. Drafting is never blocked, only
    going live."""
    if can_publish_deals(venue):
        return
    raise HTTPException(
        status_code=409,
        detail="Finish setting up payments before publishing. "
               "You can keep editing this deal and publish it once Stripe has verified your account.",
    )


def check_reel(db: Session, venue_id: str, reel_id: Optional[str]) -> None:
    """A deal can only show one of its own venue's videos."""
    if not reel_id:
        return
    reel = db.query(VenueReel).filter(VenueReel.id == reel_id).first()
    if not reel or reel.venue_id != venue_id:
        raise HTTPException(status_code=400, detail="That video doesn't belong to this venue")


def title_fields(title: Optional[str], venue: Venue, deal_price: float, unit: Optional[str]) -> dict:
    """The title to store: the venue's own name for the deal, or, when left
    blank, "<venue> · <price>" flagged auto_title so it follows price changes."""
    typed = (title or "").strip()
    if typed:
        return {"title": typed, "auto_title": False}
    return {"title": auto_title(venue.name, deal_price, unit), "auto_title": True}


@router.get("", response_model=List[DealWithVenueResponse])
def list_deals(
    suburb: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Public: browse active deals with venue info included."""
    q = db.query(Deal).options(joinedload(Deal.venue), joinedload(Deal.reel)).join(Venue, Deal.venue_id == Venue.id)
    if active_only:
        # A deal is gone once its last slot has passed (expires_at), even if
        # nobody switched it off.
        q = q.filter(
            Deal.is_active == True, Deal.spots_remaining > 0,
            or_(Deal.expires_at.is_(None), Deal.expires_at > datetime.now(timezone.utc)),
        )
    if suburb:
        q = q.filter(Venue.suburb.ilike(f"%{suburb}%"))
    if category:
        q = q.filter(Deal.category.ilike(f"%{category}%"))
    if date:
        q = q.filter(Deal.date == date)
    deals = q.order_by(Deal.created_at.desc()).all()
    return [DealWithVenueResponse.from_deal(d) for d in deals]


@router.post("", response_model=DealResponse, status_code=201)
def create_deal(
    body: DealCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    venue = (
        db.query(Venue)
        .filter(Venue.id == body.venue_id, Venue.is_active == True)
        .first()
    )
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    if venue.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized for this venue")
    fields = body.model_dump()
    # DealCreate defaults is_active to True, so refusing here would stop a
    # pending venue from creating a deal at all. Save it as a draft instead —
    # the venue can publish it themselves once Pinch clears them. Toggling it
    # live later goes through update_deal, which does refuse.
    if fields.get("is_active") and not can_publish_deals(venue):
        fields["is_active"] = False
    if body.deal_date:
        if body.deal_date < datetime.now(SYDNEY).date():
            raise HTTPException(status_code=400, detail="That date has already passed")
        fields["date"] = date_label(body.deal_date)
        fields["expires_at"] = fields.get("expires_at") or expires_for(body.deal_date, body.slots)

    check_reel(db, venue.id, body.reel_id)
    deal_price = deal_price_for(body.original_price, body.discount_pct)
    fields.update(title_fields(body.title, venue, deal_price, body.unit))
    deal = Deal(
        **fields,
        deal_price=deal_price,
        spots_remaining=body.total_spots,
    )
    db.add(deal)
    db.commit()
    db.refresh(deal)
    return deal


@router.get("/{deal_id}", response_model=DealWithVenueResponse)
def get_deal(deal_id: str, db: Session = Depends(get_db)):
    deal = (
        db.query(Deal)
        .options(joinedload(Deal.venue), joinedload(Deal.reel))
        .filter(Deal.id == deal_id)
        .first()
    )
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return DealWithVenueResponse.from_deal(deal)


@router.patch("/{deal_id}", response_model=DealResponse)
def update_deal(
    deal_id: str,
    body: DealUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    deal = _get_deal_or_404(deal_id, db)
    _assert_deal_owner(deal, user, db)

    venue = db.query(Venue).filter(Venue.id == deal.venue_id).first()
    updates = body.model_dump(exclude_unset=True)
    if updates.get("is_active"):
        _assert_can_publish(venue)
    if "reel_id" in updates:
        check_reel(db, deal.venue_id, updates["reel_id"])

    # Recompute deal_price if pricing fields are being changed
    if "original_price" in updates or "discount_pct" in updates:
        # float(): the stored value is a Decimal and the patched one a float,
        # and changing only one of the two would otherwise mix them and 500.
        new_original = float(updates.get("original_price", deal.original_price))
        new_discount = float(updates.get("discount_pct", deal.discount_pct))
        updates["deal_price"] = deal_price_for(new_original, new_discount)

    # Renamed, cleared back to automatic, or an automatic title whose price moved.
    price_changed = any(k in updates for k in ("original_price", "discount_pct", "unit"))
    if "title" in updates or (deal.auto_title and price_changed):
        title = updates["title"] if "title" in updates else (None if deal.auto_title else deal.title)
        updates.update(title_fields(
            title, venue,
            float(updates.get("deal_price", deal.deal_price)),
            updates.get("unit", deal.unit),
        ))

    # A dated deal keeps its label and end time in step with its day and slots.
    deal_date = updates.get("deal_date", deal.deal_date)
    if deal_date and ("deal_date" in updates or "slots" in updates):
        updates["date"] = date_label(deal_date)
        if "expires_at" not in updates:
            updates["expires_at"] = expires_for(deal_date, updates.get("slots", deal.slots))

    for key, value in updates.items():
        setattr(deal, key, value)
    db.commit()
    db.refresh(deal)
    return deal


@router.delete("/{deal_id}", status_code=204)
def delete_deal(
    deal_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    deal = _get_deal_or_404(deal_id, db)
    _assert_deal_owner(deal, user, db)
    db.delete(deal)
    db.commit()
