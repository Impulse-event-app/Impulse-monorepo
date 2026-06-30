from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user
from database import get_db
from models import Deal, Venue
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


@router.get("", response_model=List[DealWithVenueResponse])
def list_deals(
    suburb: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Public: browse active deals with venue info included."""
    q = db.query(Deal).options(joinedload(Deal.venue)).join(Venue, Deal.venue_id == Venue.id)
    if active_only:
        q = q.filter(Deal.is_active == True, Deal.spots_remaining > 0)
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

    deal_price = round(body.original_price * (1 - body.discount_pct / 100), 2)
    deal = Deal(
        **body.model_dump(),
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
        .options(joinedload(Deal.venue))
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

    updates = body.model_dump(exclude_unset=True)
    # Recompute deal_price if pricing fields are being changed
    if "original_price" in updates or "discount_pct" in updates:
        new_original = updates.get("original_price", deal.original_price)
        new_discount = updates.get("discount_pct", deal.discount_pct)
        updates["deal_price"] = round(new_original * (1 - new_discount / 100), 2)

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
