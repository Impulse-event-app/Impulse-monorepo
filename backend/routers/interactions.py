from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import UserVenueInteraction, Venue
from schemas import InteractionCreate, InteractionResponse

router = APIRouter()


@router.post("", response_model=InteractionResponse, status_code=201)
def log_interaction(
    body: InteractionCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Log a user–venue interaction for the recommender.
    Call this whenever a user views, saves, books, or rates a venue.
    """
    venue = db.query(Venue).filter(Venue.id == body.venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    if body.event_type == "rating":
        if body.rating is None or not (1 <= body.rating <= 5):
            raise HTTPException(
                status_code=400,
                detail="rating must be an integer between 1 and 5 for event_type='rating'",
            )

    interaction = UserVenueInteraction(
        user_id=user["sub"],
        venue_id=body.venue_id,
        event_type=body.event_type,
        rating=body.rating if body.event_type == "rating" else None,
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction
