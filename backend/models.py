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
    accessibility_needs = Column(ARRAY(Text()), nullable=False, server_default="{}")
    party_size = Column(Integer, nullable=False, server_default="2")
    age_bracket = Column(Integer, nullable=True)               # 18 | 25 | 35 | 45
    notifications_enabled = Column(Boolean, nullable=False, server_default="false")
    expo_push_token = Column(Text, nullable=True)              # ExponentPushToken[...] for push
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
    accessibility_features = Column(ARRAY(Text()), nullable=False, server_default="{}")  # disability-friendly features the venue offers
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
    # Null until the Pinch deposit succeeds — the code only exists once paid.
    confirmation_code = Column(Text, nullable=True, unique=True)
    status = Column(_BOOKING_STATUS, nullable=False, server_default="confirmed")
    redeemed_at = Column(DateTime(timezone=True), nullable=True)   # set when venue scans the ticket
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Pinch payment fields ──────────────────────────────────
    deposit_amount_cents = Column(Integer, nullable=True)
    balance_amount_cents = Column(Integer, nullable=True)
    deposit_payment_id = Column(Text, nullable=True)               # pmt_XXX for the 20% deposit
    balance_payment_id = Column(Text, nullable=True)               # pmt_XXX for the 80% balance
    pinch_payer_id = Column(Text, nullable=True)                   # pyr_XXX
    pinch_source_id = Column(Text, nullable=True)                  # src_XXX (vaulted card)
    # unpaid | deposit_paid | fully_paid | cancelled
    payment_status = Column(Text, nullable=False, server_default="unpaid")
    # Customer-facing outcome of the balance charge (shown in-app on the Plans screen)
    payment_note = Column(Text, nullable=True)
    # True when the balance charge declined at redemption — venue collects directly
    payment_followup = Column(Boolean, nullable=False, server_default="false")

    deal: "Deal" = relationship("Deal", back_populates="bookings")
    user: "User" = relationship("User", back_populates="bookings")


class Huddle(Base):
    """A group plan: N people vote on deals, winner becomes a shared booking."""
    __tablename__ = "huddles"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    creator_member_id = Column(UUID(as_uuid=False), ForeignKey("huddle_members.id", use_alter=True), nullable=True)
    group_size = Column(Integer, nullable=False)
    # open | voting_complete | awaiting_payment | active | expired | collapsed | redeemed
    status = Column(Text, nullable=False, server_default="open")
    join_token = Column(Text, nullable=False, unique=True)
    winning_deal_id = Column(UUID(as_uuid=False), ForeignKey("deals.id"), nullable=True)
    common_code = Column(Text, nullable=True, unique=True)
    voting_deadline = Column(DateTime(timezone=True), nullable=True)
    payment_deadline = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Bumped on every member join/vote/pay — the realtime poke channel.
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    members: List["HuddleMember"] = relationship(
        "HuddleMember", back_populates="huddle", foreign_keys="HuddleMember.huddle_id",
    )
    winning_deal: Optional["Deal"] = relationship("Deal", foreign_keys=[winning_deal_id])


class HuddleMember(Base):
    __tablename__ = "huddle_members"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    huddle_id = Column(UUID(as_uuid=False), ForeignKey("huddles.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)   # null → guest
    display_name = Column(Text, nullable=False)
    # Secret returned to the joining client; authenticates guests on later calls.
    member_token = Column(Text, nullable=False, unique=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Sealed until resolution — never exposed to other members via any endpoint.
    ballot = Column(JSONB, nullable=True)                          # ordered deal ids, best first
    ballot_at = Column(DateTime(timezone=True), nullable=True)
    pinch_payer_id = Column(Text, nullable=True)
    pinch_source_id = Column(Text, nullable=True)
    deposit_payment_id = Column(Text, nullable=True)
    deposit_status = Column(Text, nullable=False, server_default="unpaid")  # unpaid | paid | refunded
    balance_payment_id = Column(Text, nullable=True)
    balance_status = Column(Text, nullable=False, server_default="unpaid")

    huddle: "Huddle" = relationship("Huddle", back_populates="members", foreign_keys=[huddle_id])


class Waitlist(Base):
    """Pre-launch signups from the landing page. Anonymous — no auth, no FK
    into users; the same person can later create an account with no link back.

    `referral_code` is this entry's own code (handed back so they can recruit);
    `referred_by` is whoever recruited them — a raw code, deliberately not a
    foreign key, so an unknown ?ref= is ignored rather than rejected.
    """
    __tablename__ = "waitlist"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(Text, nullable=False)
    email = Column(Text, nullable=False, unique=True)
    # Multi-select, validated against a closed set by the API.
    preferred_activities = Column(ARRAY(Text()), nullable=False, server_default="{}")
    # Free text, only set when "Something else" is among the choices.
    other_activity = Column(Text, nullable=True)
    area = Column(Text, nullable=False)
    referral_code = Column(Text, nullable=False, unique=True)
    referred_by = Column(Text, nullable=True)
    referral_count = Column(Integer, nullable=False, server_default="0")
    # Denormalised: base rank by created_at, minus referral_count, floored at 1.
    # Only the referrer's value is recomputed on a referred signup.
    position = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Settlement(Base):
    """One Pinch transfer — money actually leaving Pinch for a bank account.

    Mirrors GET /transfers/{id}. This is the signal a venue cares about:
    an approved payment only means the card worked, whereas a transfer means
    the funds have been sent. Amounts are integer cents, matching Pinch.

    Today every charge runs through the single Impulse merchant, so one
    transfer spans many venues and the per-venue split lives in the lines.
    Once venues become managed merchants a transfer maps to exactly one
    venue, and `venue_id` here is set — the lines keep working either way.
    """
    __tablename__ = "settlements"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    pinch_transfer_id = Column(Text, nullable=False, unique=True)   # tra_XXX
    pinch_merchant_id = Column(Text, nullable=True)                 # mch_XXX the transfer settled for
    venue_id = Column(UUID(as_uuid=False), ForeignKey("venues.id"), nullable=True, index=True)
    # processing | negative-balance | complete | pending-return | failed | failed-return | withheld
    status = Column(Text, nullable=False, server_default="processing")
    amount_cents = Column(Integer, nullable=False, server_default="0")      # net actually transferred
    total_fees_cents = Column(Integer, nullable=False, server_default="0")
    currency = Column(Text, nullable=False, server_default="AUD")
    reference = Column(Text, nullable=True)                         # what shows on the bank statement
    account_name = Column(Text, nullable=True)
    bsb = Column(Text, nullable=True)
    account_number = Column(Text, nullable=True)                    # Pinch returns this already masked
    transfer_date = Column(DateTime(timezone=True), nullable=True)
    # Pinch's own breakdown: Settlements / Dishonours / Application Fees / Transfer Fee / Refunds
    summary = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    lines: List["SettlementLine"] = relationship("SettlementLine", back_populates="settlement")


class SettlementLine(Base):
    """A single line inside a transfer — mirrors GET /transfers/items/{id}.

    `venue_amount_cents` is deliberately computed from our own booking ledger
    rather than read off Pinch: Pinch reports gross and its own fees, but the
    Impulse application fee split is our rule, so deriving it here keeps the
    venue-facing number correct regardless of how Pinch reports platform fees.
    """
    __tablename__ = "settlement_lines"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    settlement_id = Column(UUID(as_uuid=False), ForeignKey("settlements.id"), nullable=False, index=True)
    pinch_line_id = Column(Text, nullable=True)                     # id of the line as Pinch reports it
    pinch_payment_id = Column(Text, nullable=True, index=True)      # pmt_XXX, when resolvable
    booking_id = Column(UUID(as_uuid=False), ForeignKey("bookings.id"), nullable=True, index=True)
    venue_id = Column(UUID(as_uuid=False), ForeignKey("venues.id"), nullable=True, index=True)
    kind = Column(Text, nullable=True)                              # deposit | balance
    # Pinch line type: Settlement | Dishonour | Application Fee | Transfer Fee | Refund
    line_type = Column(Text, nullable=True)
    gross_cents = Column(Integer, nullable=False, server_default="0")
    fees_cents = Column(Integer, nullable=False, server_default="0")
    total_cents = Column(Integer, nullable=False, server_default="0")
    venue_amount_cents = Column(Integer, nullable=False, server_default="0")
    description = Column(Text, nullable=True)
    transaction_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    settlement: "Settlement" = relationship("Settlement", back_populates="lines")


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
