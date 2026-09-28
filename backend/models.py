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
    # One Pinch payer per user, created on first card save and reused forever.
    # Cards vault as sources against it — see PaymentMethod.
    pinch_payer_id = Column(Text, nullable=True)               # pyr_XXX
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    venues: List["Venue"] = relationship("Venue", back_populates="owner")
    bookings: List["Booking"] = relationship("Booking", back_populates="user")
    interactions: List["UserVenueInteraction"] = relationship("UserVenueInteraction", back_populates="user")
    payment_methods: List["PaymentMethod"] = relationship(
        "PaymentMethod", back_populates="user", cascade="all, delete-orphan"
    )


class PaymentMethod(Base):
    """A card the user chose to keep on file — one Pinch source, plus the
    display fields needed to render it without another API call.

    Only what Pinch returns from create-source is stored: never a PAN, never a
    CVV. `display_card_number` is the bare last 4 ("4654"), so the UI builds its
    own mask; `card_scheme` arrives lowercase ("visa") and is title-cased for
    display."""
    __tablename__ = "payment_methods"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    pinch_source_id = Column(Text, nullable=False, unique=True)    # src_XXX
    card_scheme = Column(Text, nullable=True)                      # "visa" | "mastercard" | ...
    display_card_number = Column(Text, nullable=True)              # bare last 4
    expiry_date = Column(Text, nullable=True)                      # as Pinch returns it
    card_holder_name = Column(Text, nullable=True)
    funding = Column(Text, nullable=True)                          # credit | debit | prepaid | ...
    is_default = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: "User" = relationship("User", back_populates="payment_methods")


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

    # ── Pinch managed merchant ──────────────────────────────────────────────
    # NULL pinch_merchant_id means "not onboarded" — those venues still charge
    # through the single hardcoded PINCH_TEST_MERCHANT_ID, which is every venue
    # that predates this flow. Nothing here reroutes money; it records the
    # account so a later, explicit cutover can.
    pinch_merchant_id = Column(Text, nullable=True)             # mch_XXX
    pinch_compliance_status = Column(Text, nullable=True)       # compliance.status, e.g. "new"
    pinch_submission_status = Column(Text, nullable=True)       # in-progress/pending/in-review/approved/rejected
    pinch_merchant_status = Column(Text, nullable=True)         # "active" once cleared for live payments
    pinch_compliance_notes = Column(Text, nullable=True)        # reviewer notes, surfaced on rejection
    pinch_compliance_updated_at = Column(DateTime(timezone=True), nullable=True)
    pinch_webhook_secret = Column(Text, nullable=True)          # whsec_XXX for this venue's webhook uri
    # [{"contact_id": "con_XXX", "contact_type": "director", "first_name": ...,
    #   "last_name": ..., "ownership": 25.0, "is_ubo": true}] — the con_XXX ids are
    # what attach an identity document to a specific person.
    pinch_contacts = Column(JSONB, nullable=True)

    abn = Column(Text, nullable=True)                           # sent as companyRegistrationNumber
    afsl_held = Column(Boolean, nullable=True)
    afsl_number = Column(Text, nullable=True)
    austrac_registered = Column(Boolean, nullable=True)

    bank_account_name = Column(Text, nullable=True)
    bank_bsb = Column(Text, nullable=True)
    bank_account_last3 = Column(Text, nullable=True)            # display only; the full number is never stored

    # Half-finished onboarding, so a form abandoned mid-way survives a device change.
    # The full bank account number lives here between the bank step and submission
    # and is stripped from every read and deleted once the merchant exists.
    onboarding_draft = Column(JSONB, nullable=True)

    owner: "User" = relationship("User", back_populates="venues")
    deals: List["Deal"] = relationship("Deal", back_populates="venue")
    interactions: List["UserVenueInteraction"] = relationship("UserVenueInteraction", back_populates="venue")
    merchant_documents: List["MerchantDocument"] = relationship(
        "MerchantDocument", back_populates="venue", cascade="all, delete-orphan"
    )


class MerchantDocument(Base):
    """A compliance document we forwarded to Pinch — metadata only.

    The file itself is streamed straight through to Pinch and never touches our
    disk or storage, so there is deliberately no path, bucket or blob column here.
    `label` is generated by us from the document type and the person it belongs to;
    the uploader's own filename is never recorded, because filenames of identity
    documents routinely contain the holder's name and licence number.
    """

    __tablename__ = "merchant_documents"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    venue_id = Column(UUID(as_uuid=False), ForeignKey("venues.id", ondelete="CASCADE"),
                      nullable=False, index=True)
    pinch_document_id = Column(Text, nullable=False)            # doc_XXX
    document_type = Column(Text, nullable=False)
    pinch_contact_id = Column(Text, nullable=True)              # con_XXX for identity documents
    label = Column(Text, nullable=False)
    size_bytes = Column(Integer, nullable=True)
    content_type = Column(Text, nullable=True)
    uploaded_by = Column(UUID(as_uuid=False), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    venue: "Venue" = relationship("Venue", back_populates="merchant_documents")


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


_INTERACTION_TYPE = SAEnum(
    "view", "save", "booking", "rating",
    name="interaction_type",
)


class Booking(Base):
    """The one booking model. A solo booking has one participant; a direct
    split booking has one participant per seat; a Huddle is a booking with
    has_voting = true, whose deal is picked by ballot before shares are
    collected. Everything after the deal is known — shares, the payment
    fan-out, declines, refunds, the redemption code — is shared."""
    __tablename__ = "bookings"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    # Null only while a Huddle is still voting (CHECK has_voting OR deal_id IS NOT NULL).
    deal_id = Column(UUID(as_uuid=False), ForeignKey("deals.id"), nullable=True, index=True)
    # The initiator's account. Nullable: a booking outlives its customer's
    # account (ON DELETE SET NULL) so the financial record survives, anonymised.
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    slot_time = Column(Text, nullable=True)
    num_people = Column(Integer, nullable=False)                  # group size
    total_paid = Column(Numeric(10, 2), nullable=False)          # locked_price_cents / 100, for display
    # Null until every share is in (or guaranteed) — the code only exists once paid.
    confirmation_code = Column(Text, nullable=True, unique=True)
    # voting | collecting | confirmed | redeemed | cancelled | expired | collapsed
    status = Column(Text, nullable=False, server_default="collecting")
    redeemed_at = Column(DateTime(timezone=True), nullable=True)   # set when venue scans the code
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Bumped on every join/vote/pay/split change — the realtime poke channel.
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Split ─────────────────────────────────────────────────
    has_voting = Column(Boolean, nullable=False, server_default="false")
    split_mode = Column(Text, nullable=False, server_default="even")      # even | custom
    # Frozen when the deal is fixed (creation, or Huddle resolution) and never
    # re-read from the deal: the amount each person saw is the amount charged.
    locked_unit_price_cents = Column(Integer, nullable=True)
    locked_price_cents = Column(Integer, nullable=True)
    initiator_member_id = Column(
        UUID(as_uuid=False),
        ForeignKey("booking_participants.id", use_alter=True, name="fk_bookings_initiator_member"),
        nullable=True,
    )
    share_deadline = Column(DateTime(timezone=True), nullable=True)
    # Set once the initiator has chosen the split; shares are collected after.
    split_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    # Spots are taken out of the deal once (initiator's deposit / Huddle resolution).
    spots_held = Column(Boolean, nullable=False, server_default="false")

    # ── Voting stage (Huddle only) ────────────────────────────
    join_token = Column(Text, nullable=True, unique=True)
    voting_deadline = Column(DateTime(timezone=True), nullable=True)

    deal: Optional["Deal"] = relationship("Deal", back_populates="bookings")
    user: "User" = relationship("User", back_populates="bookings")
    participants: List["BookingParticipant"] = relationship(
        "BookingParticipant", back_populates="booking", foreign_keys="BookingParticipant.booking_id",
    )


class BookingParticipant(Base):
    """One seat in a booking: who holds it, what their share is, and how it was paid."""
    __tablename__ = "booking_participants"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    booking_id = Column(UUID(as_uuid=False), ForeignKey("bookings.id"), nullable=False, index=True)
    # Null for a direct-booking seat nobody has claimed yet, or a member whose
    # account was since deleted (ON DELETE SET NULL).
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    display_name = Column(Text, nullable=True)
    # Per-seat invite link for direct bookings (one link per seat).
    seat_token = Column(Text, nullable=True, unique=True)
    seat_label = Column(Text, nullable=True)                      # e.g. "Sam", set by the initiator
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    claimed_at = Column(DateTime(timezone=True), nullable=True)

    # Sealed until resolution — never exposed to other members via any endpoint.
    ballot = Column(JSONB, nullable=True)                          # ordered deal ids, best first
    ballot_at = Column(DateTime(timezone=True), nullable=True)

    # ── Share (stored, never derived at read time) ────────────
    share_amount_cents = Column(Integer, nullable=True)
    deposit_cents = Column(Integer, nullable=True)
    balance_cents = Column(Integer, nullable=True)
    # Set when someone covers this seat: its share moved to them, this seat owes nothing.
    covered_by_member_id = Column(UUID(as_uuid=False), ForeignKey("booking_participants.id"), nullable=True)

    # ── Payment ───────────────────────────────────────────────
    pinch_payer_id = Column(Text, nullable=True)
    pinch_source_id = Column(Text, nullable=True)
    deposit_payment_id = Column(Text, nullable=True, index=True)
    # unpaid | paid | guaranteed | settled | refunded | declined
    deposit_status = Column(Text, nullable=False, server_default="unpaid")
    # Bumped after a definitive decline or a share change, so the next attempt
    # gets a fresh nonce (Pinch replays the first result for a reused nonce).
    deposit_attempt = Column(Integer, nullable=False, server_default="0")
    balance_payment_id = Column(Text, nullable=True, index=True)
    balance_status = Column(Text, nullable=False, server_default="unpaid")   # unpaid | paid | declined
    payment_note = Column(Text, nullable=True)                     # customer-facing charge outcome
    payment_followup = Column(Boolean, nullable=False, server_default="false")

    booking: "Booking" = relationship("Booking", back_populates="participants", foreign_keys=[booking_id])


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
