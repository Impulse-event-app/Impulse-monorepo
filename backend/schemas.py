from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict


# ── User ──────────────────────────────────────────────────────────────────────

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    home_suburb: Optional[str] = None
    preferred_acts: Optional[List[str]] = None
    party_size: Optional[int] = None
    age_bracket: Optional[int] = None
    notifications_enabled: Optional[bool] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: Optional[str]
    phone: Optional[str]
    full_name: Optional[str]
    avatar_url: Optional[str]
    home_suburb: Optional[str]
    preferred_acts: List[str]
    party_size: int
    age_bracket: Optional[int]
    notifications_enabled: bool
    created_at: datetime
    updated_at: datetime


# ── Venue ─────────────────────────────────────────────────────────────────────

class VenueCreate(BaseModel):
    name: str
    category: str
    description: Optional[str] = None
    address: Optional[str] = None
    suburb: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    opening_hours: Optional[str] = None


class VenueUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    suburb: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    opening_hours: Optional[str] = None
    is_active: Optional[bool] = None


class VenueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    name: str
    category: str
    description: Optional[str]
    address: Optional[str]
    suburb: Optional[str]
    lat: Optional[float]
    lng: Optional[float]
    phone: Optional[str]
    email: Optional[str]
    website: Optional[str]
    opening_hours: Optional[str]
    is_active: bool
    avg_rating: float
    total_ratings: int
    created_at: datetime


# ── Deal ──────────────────────────────────────────────────────────────────────

class DealCreate(BaseModel):
    venue_id: str
    title: str
    category: str
    description: Optional[str] = None
    original_price: float
    discount_pct: float
    date: str
    slots: List[str]
    max_group_size: int = 6
    total_spots: int
    is_active: bool = True
    expires_at: Optional[datetime] = None


class DealUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    original_price: Optional[float] = None
    discount_pct: Optional[float] = None
    date: Optional[str] = None
    slots: Optional[List[str]] = None
    max_group_size: Optional[int] = None
    total_spots: Optional[int] = None
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None


class DealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    venue_id: str
    title: str
    category: str
    description: Optional[str]
    original_price: float
    discount_pct: float
    deal_price: float
    date: str
    slots: List[str]
    max_group_size: int
    total_spots: int
    spots_remaining: int
    is_active: bool
    expires_at: Optional[datetime]
    created_at: datetime


# ── Booking ───────────────────────────────────────────────────────────────────

class BookingCreate(BaseModel):
    deal_id: str
    slot_time: str
    num_people: int


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    deal_id: str
    user_id: str
    slot_time: str
    num_people: int
    total_paid: float
    confirmation_code: str
    status: str
    redeemed_at: Optional[datetime]
    created_at: datetime


class RedeemResponse(BaseModel):
    """Returned to the venue when they scan a ticket."""
    model_config = ConfigDict(from_attributes=True)

    confirmation_code: str
    status: str
    slot_time: str
    num_people: int
    redeemed_at: Optional[datetime]


# ── User–Venue Interaction (recommender signal) ───────────────────────────────

InteractionType = Literal["view", "save", "booking", "rating"]

class InteractionCreate(BaseModel):
    venue_id: str
    event_type: InteractionType
    rating: Optional[int] = None   # 1–5, required when event_type="rating"


class InteractionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    venue_id: str
    event_type: str
    rating: Optional[int]
    created_at: datetime


# ── Stats ─────────────────────────────────────────────────────────────────────

class StatsResponse(BaseModel):
    active_deals: int
    bookings_today: int
    revenue_today: float
    spots_filled: int
    total_spots: int
