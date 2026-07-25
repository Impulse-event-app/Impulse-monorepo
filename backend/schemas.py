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
    image_url: Optional[str] = None


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
    image_url: Optional[str] = None
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
    image_url: Optional[str]
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
    unit: Optional[str] = None         # pricing unit, e.g. "pp", "/lane", "/room·hr"
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
    unit: Optional[str] = None
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
    unit: Optional[str]
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


class DealWithVenueResponse(DealResponse):
    """Extends DealResponse with joined venue fields for the mobile feed."""
    venue_name: str
    venue_address: Optional[str]
    venue_suburb: Optional[str]
    venue_lat: Optional[float]
    venue_lng: Optional[float]
    venue_avg_rating: float
    venue_image_url: Optional[str]

    @classmethod
    def from_deal(cls, deal: object) -> "DealWithVenueResponse":
        """Build from a Deal ORM object that has its .venue relationship loaded."""
        d = deal  # type: ignore[assignment]
        return cls(
            # deal fields
            id=d.id,
            venue_id=d.venue_id,
            title=d.title,
            category=d.category,
            description=d.description,
            unit=d.unit,
            original_price=float(d.original_price),
            discount_pct=float(d.discount_pct),
            deal_price=float(d.deal_price),
            date=d.date,
            slots=d.slots,
            max_group_size=d.max_group_size,
            total_spots=d.total_spots,
            spots_remaining=d.spots_remaining,
            is_active=d.is_active,
            expires_at=d.expires_at,
            created_at=d.created_at,
            # venue fields
            venue_name=d.venue.name,
            venue_address=d.venue.address,
            venue_suburb=d.venue.suburb,
            venue_lat=d.venue.lat,
            venue_lng=d.venue.lng,
            venue_avg_rating=float(d.venue.avg_rating),
            venue_image_url=d.venue.image_url,
        )


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


class BookingWithDetailsResponse(BookingResponse):
    """Extends BookingResponse with deal + venue info for the Plans screen."""
    venue_id: str
    venue_name: str
    deal_title: str
    deal_category: str

    @classmethod
    def from_booking(cls, booking: object) -> "BookingWithDetailsResponse":
        b = booking  # type: ignore[assignment]
        return cls(
            id=b.id,
            deal_id=b.deal_id,
            user_id=b.user_id,
            slot_time=b.slot_time,
            num_people=b.num_people,
            total_paid=float(b.total_paid),
            confirmation_code=b.confirmation_code,
            status=b.status,
            redeemed_at=b.redeemed_at,
            created_at=b.created_at,
            venue_id=b.deal.venue_id,
            venue_name=b.deal.venue.name,
            deal_title=b.deal.title,
            deal_category=b.deal.category,
        )


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
