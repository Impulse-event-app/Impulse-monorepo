"""Weekly deal schedules, managed by the venue owner from venue-web.

A schedule never takes bookings itself: deal_schedules.generate_scheduled_deals
turns it into a Deal on each evening it runs. Saving one generates tonight's
deal straight away when tonight is one of its days, so the venue sees it live.
Editing or pausing a schedule changes future evenings only; a deal already
made for tonight is edited or switched off from the deals list like any other.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from deal_schedules import generate_scheduled_deals
from models import DealSchedule, Venue
from schemas import DealScheduleCreate, DealScheduleResponse, DealScheduleUpdate

router = APIRouter()


def _owned_venue(venue_id: str, user: dict, db: Session) -> Venue:
    venue = db.query(Venue).filter(Venue.id == venue_id, Venue.is_active == True).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    if venue.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized for this venue")
    return venue


def _owned_schedule(schedule_id: str, user: dict, db: Session) -> DealSchedule:
    schedule = db.query(DealSchedule).filter(DealSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    _owned_venue(schedule.venue_id, user, db)
    return schedule


@router.get("", response_model=List[DealScheduleResponse])
def list_schedules(venue_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    _owned_venue(venue_id, user, db)
    return (
        db.query(DealSchedule)
        .filter(DealSchedule.venue_id == venue_id)
        .order_by(DealSchedule.created_at.desc())
        .all()
    )


@router.get("/{schedule_id}", response_model=DealScheduleResponse)
def get_schedule(schedule_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    return _owned_schedule(schedule_id, user, db)


@router.post("", response_model=DealScheduleResponse, status_code=201)
def create_schedule(body: DealScheduleCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    _owned_venue(body.venue_id, user, db)
    schedule = DealSchedule(**body.model_dump())
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    generate_scheduled_deals(db, venue_id=schedule.venue_id)
    db.refresh(schedule)
    return schedule


@router.put("/{schedule_id}", response_model=DealScheduleResponse)
def update_schedule(
    schedule_id: str,
    body: DealScheduleUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    schedule = _owned_schedule(schedule_id, user, db)
    for key, value in body.model_dump().items():
        setattr(schedule, key, value)
    db.commit()
    generate_scheduled_deals(db, venue_id=schedule.venue_id)
    db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    # Deals it already made stay (bookings point at them); their schedule_id goes null.
    schedule = _owned_schedule(schedule_id, user, db)
    db.delete(schedule)
    db.commit()
