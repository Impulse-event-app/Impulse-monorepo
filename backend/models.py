import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, Numeric, SmallInteger, Text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True)        # mirrors auth.users.id
    email = Column(Text, nullable=True)
    phone = Column(Text, nullable=True)
    full_name = Column(Text, nullable=True)
    avatar_url = Column(Text, nullable=True)
    home_suburb = Column(Text, nullable=True)
    preferred_acts = Column(ARRAY(Text()), nullable=False, server_default="{}")
    party_size = Column(Integer, nullable=False, server_default="2")
    age_bracket = Column(Integer, nullable=True)               # 18 | 25 | 35 | 45
    notifications_enabled = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    venues: List["Venue"] = relationship("Venue", back_populates="owner")
    bookings: List["Booking"] = relationship("Booking", back_populates="user")
    interactions: List["UserVenueInteraction"] = relationship("UserVenueInteraction", back_populates="user")


class Venue(Base):
    __tablename__ = "venues"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(Text, nullable=False)
    category = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    address = Column(Text, nullable=True)
    suburb = Column(Text, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    phone = Column(Text, nullable=True)
    email = Column(Text, nullable=True)
    website = Column(Text, nullable=True)
    opening_hours = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)                    # hero photo, uploaded via venue-web to Supabase Storage
    is_active = Column(Boolean, default=True, nullable=False)
    avg_rating = Column(Numeric(3, 2), nullable=False, server_default="0")
    total_ratings = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    owner: "User" = relationship("User", back_populates="venues")
    deals: List["Deal"] = relationship("Deal", back_populates="venue")
    interactions: List["UserVenueInteraction"] = relationship("UserVenueInteraction", back_populates="venue")


class Deal(Base):
    __tablename__ = "deals"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    venue_id = Column(UUID(as_uuid=False), ForeignKey("venues.id"), nullable=False, index=True)
    title = Column(Text, nullable=False)
    category = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    unit = Column(Text, nullable=True)                         # pricing unit, e.g. "pp", "/lane"
    original_price = Column(Numeric(10, 2), nullable=False)
    discount_pct = Column(Numeric(5, 2), nullable=False)
    deal_price = Column(Numeric(10, 2), nullable=False)        # computed on create/update
    date = Column(Text, nullable=False)                        # e.g. "Monday 3 June 2026"
    slots = Column(JSONB, nullable=False)                      # ["5:00 PM", "6:00 PM"]
    max_group_size = Column(Integer, default=6, nullable=False)
    total_spots = Column(Integer, nullable=False)
    spots_remaining = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    venue: "Venue" = relationship("Venue", back_populates="deals")
    bookings: List["Booking"] = relationship("Booking", back_populates="deal")


_BOOKING_STATUS = SAEnum(
    "pending", "confirmed", "cancelled", "attended",
    name="booking_status",
)

_INTERACTION_TYPE = SAEnum(
    "view", "save", "booking", "rating",
    name="interaction_type",
)


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    deal_id = Column(UUID(as_uuid=False), ForeignKey("deals.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    slot_time = Column(Text, nullable=False)
    num_people = Column(Integer, nullable=False)
    total_paid = Column(Numeric(10, 2), nullable=False)
    confirmation_code = Column(Text, nullable=False, unique=True)
    status = Column(_BOOKING_STATUS, nullable=False, server_default="confirmed")
    redeemed_at = Column(DateTime(timezone=True), nullable=True)   # set when venue scans the ticket
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    deal: "Deal" = relationship("Deal", back_populates="bookings")
    user: "User" = relationship("User", back_populates="bookings")


class UserVenueInteraction(Base):
    """
    Recommender signal table.
    Every view, save, booking, and post-visit rating is appended here.
    Never updated — only inserted.
    """
    __tablename__ = "user_venue_interactions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    venue_id = Column(UUID(as_uuid=False), ForeignKey("venues.id"), nullable=False, index=True)
    event_type = Column(_INTERACTION_TYPE, nullable=False)
    rating = Column(SmallInteger, nullable=True)               # 1–5, only for event_type='rating'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: "User" = relationship("User", back_populates="interactions")
    venue: "Venue" = relationship("Venue", back_populates="interactions")
