from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from schemas import UserResponse, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def get_me(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return the calling user's profile."""
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        raise HTTPException(status_code=404, detail="User profile not found")
    return row


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UserUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update (or create) the calling user's onboarding / profile fields."""
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        # First-time sign-in via email/password — create the row now.
        row = User(id=user["sub"], email=user.get("email"))
        db.add(row)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row
