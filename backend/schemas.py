from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ── User ──────────────────────────────────────────────────────────────────────

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    home_suburb: Optional[str] = None
    preferred_acts: Optional[List[str]] = None
    accessibility_needs: Optional[List[str]] = None
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
    accessibility_needs: List[str]
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
    accessibility_features: Optional[List[str]] = None


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
    accessibility_features: Optional[List[str]] = None
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
    accessibility_features: List[str]
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
    venue_accessibility_features: List[str]

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
            venue_accessibility_features=d.venue.accessibility_features or [],
        )


# ── Booking ───────────────────────────────────────────────────────────────────

class BookingCreate(BaseModel):
    deal_id: str
    slot_time: str
    num_people: int


class BookingPay(BaseModel):
    """CaptureJs card token + payer details for the Pinch deposit charge."""
    token: str
    card_holder_name: str
    email: str
    first_name: str
    last_name: str


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    deal_id: str
    user_id: str
    slot_time: str
    num_people: int
    total_paid: float
    confirmation_code: Optional[str]   # null until the deposit is paid
    status: str
    redeemed_at: Optional[datetime]
    created_at: datetime
    deposit_amount_cents: Optional[int] = None
    balance_amount_cents: Optional[int] = None
    payment_status: str = "unpaid"
    payment_note: Optional[str] = None      # customer-facing balance-charge outcome
    payment_followup: bool = False


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
            deposit_amount_cents=b.deposit_amount_cents,
            balance_amount_cents=b.balance_amount_cents,
            payment_status=b.payment_status,
            payment_note=b.payment_note,
            payment_followup=b.payment_followup,
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
    payment_status: str = "unpaid"
    balance_amount_cents: Optional[int] = None
    # Set when the balance charge declined — venue collects payment directly
    payment_warning: Optional[str] = None


class CancelResponse(BaseModel):
    cancelled: bool
    depositForfeited: bool
    depositAmountCents: int


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


# ── Payouts (venue view of Pinch transfers) ───────────────────────────────────

class PayoutLine(BaseModel):
    """One booking's contribution to a payout."""
    booking_id: Optional[str]
    confirmation_code: Optional[str]
    deal_title: Optional[str]
    kind: Optional[str]                 # deposit | balance
    line_type: Optional[str]            # Settlement | Dishonour | ...
    amount_cents: int                   # what the venue is owed for this line
    transaction_date: Optional[datetime]


class PayoutResponse(BaseModel):
    """A Pinch transfer, sliced to the part that belongs to one venue.

    `amount_cents` is this venue's share, not the whole transfer — with every
    charge currently on the single Impulse merchant, one transfer covers many
    venues. `transfer_net_cents` is the full transfer for reference.
    """
    id: str
    pinch_transfer_id: str
    status: str
    reference: Optional[str]
    currency: str
    amount_cents: int
    transfer_net_cents: int
    transfer_date: Optional[datetime]
    account_name: Optional[str]
    bsb: Optional[str]
    account_number: Optional[str]
    lines: List[PayoutLine]


class PayoutSummary(BaseModel):
    """Header figures for the payouts page."""
    paid_cents: int        # settled and complete
    in_transit_cents: int  # transfer raised, not yet complete
    awaiting_cents: int    # earned on redeemed bookings, not yet in any transfer
    payout_count: int
    last_payout_date: Optional[datetime]


class PayoutsResponse(BaseModel):
    summary: PayoutSummary
    payouts: List[PayoutResponse]


# ── Huddle (group voting → shared booking) ────────────────────────────────────

class HuddleCreate(BaseModel):
    group_size: int   # 2–10
    display_name: Optional[str] = None   # creator's name; falls back to profile


class HuddleJoin(BaseModel):
    display_name: Optional[str] = None   # required for guests; signed-in users fall back to profile name


class HuddleMemberPublic(BaseModel):
    """What any member may see about any other member. Ballots stay sealed —
    only the fact that a ballot exists (has_voted) is ever exposed."""
    id: str
    display_name: str
    is_creator: bool
    has_voted: bool
    deposit_status: str
    balance_status: str


class HuddleResponse(BaseModel):
    id: str
    status: str
    group_size: int
    join_token: str
    voting_deadline: Optional[datetime]
    payment_deadline: Optional[datetime]
    winning_deal_id: Optional[str]
    # Only set (non-null) once the huddle is active — payment complete.
    common_code: Optional[str]
    members: List[HuddleMemberPublic]
    created_at: datetime
    # Caller-specific fields (never another member's):
    my_member_id: Optional[str] = None
    my_has_voted: bool = False
    # My share of the winning deal — set once resolved. The amount charged at
    # payment time is exactly my_share.deposit_cents, never recomputed.
    my_share: Optional["HuddleShare"] = None
    # Joined winning deal details once resolved.
    winning_deal: Optional[DealWithVenueResponse] = None


class HuddleJoinResponse(BaseModel):
    huddle: HuddleResponse
    member_id: str
    # Secret for this seat. Returned only to its owner, at create/join time.
    member_token: str


class BallotSubmit(BaseModel):
    """Ordered deal ids, best first. Up to 3; must all be current candidates."""
    picks: List[str]


class HuddleShare(BaseModel):
    total_cents: int
    deposit_cents: int
    balance_cents: int


class PushTokenRegister(BaseModel):
    expo_push_token: str


class HuddlePay(BaseModel):
    """CaptureJs card token + payer details for a member's deposit-share charge."""
    token: str
    card_holder_name: str
    email: str
    first_name: str
    last_name: str


# ── Huddle venue verification (group redemption) ──────────────────────────────

class HuddleVerifyMember(BaseModel):
    name: str
    balance_cents: int
    balance_status: str            # unpaid | paid | declined


class HuddleVerifyResponse(BaseModel):
    """Preview shown to venue staff before confirming the group charge."""
    huddle_id: str
    group_size: int
    venue_name: str
    deal_title: str
    slot: str
    total_balance_cents: int
    members: List[HuddleVerifyMember]
    status: str
    already_redeemed: bool


class HuddleRedeemMemberResult(BaseModel):
    name: str
    balance_cents: int
    status: str                    # paid | declined
    warning: Optional[str] = None  # "collect $X from {name} directly"


class HuddleRedeemResponse(BaseModel):
    huddle_id: str
    redeemed: bool
    members: List[HuddleRedeemMemberResult]
    total_charged_cents: int
    declines: int


# ── Waitlist ──────────────────────────────────────────────────────────────────

WaitlistActivity = Literal[
    "Bowling", "Escape Room", "Karaoke", "Mini Golf",
    "Go-karting", "Comedy", "Live Music", "Something else",
]

OTHER_ACTIVITY = "Something else"

WaitlistArea = Literal[
    "CBD", "Inner West", "Eastern Suburbs",
    "North Shore", "South Sydney", "Western Sydney",
]


# Same shape venue-web validates onboarding emails against — deliberately
# permissive. email-validator isn't a backend dependency and one waitlist form
# isn't reason enough to add it.
EMAIL_PATTERN = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"


class WaitlistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254, pattern=EMAIL_PATTERN)
    preferred_activities: List[WaitlistActivity] = Field(min_length=1)
    # Only meaningful alongside "Something else"; ignored otherwise.
    other_activity: Optional[str] = Field(default=None, max_length=80)
    area: WaitlistArea
    # Raw ?ref= code from the URL. Unknown codes are ignored silently.
    referred_by: Optional[str] = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def _check_activities(self) -> "WaitlistCreate":
        # Dedupe while preserving the order they were ticked in.
        seen: set = set()
        self.preferred_activities = [
            a for a in self.preferred_activities
            if not (a in seen or seen.add(a))
        ]

        typed = (self.other_activity or "").strip()
        if OTHER_ACTIVITY in self.preferred_activities:
            if not typed:
                raise ValueError('Tell us what else you\'re into, or untick "Something else"')
            self.other_activity = typed
        else:
            # Drop stray free text so it can't arrive without the choice that
            # justifies it — otherwise the stats long tail fills with orphans.
            self.other_activity = None
        return self


class WaitlistEntryResponse(BaseModel):
    """What the signup gets back — everything the confirmation card renders.
    Returned on a fresh signup (201) and on a duplicate email (409 detail), so
    someone who signs up twice gets their existing link rather than an error."""
    name: str
    position: int
    referral_code: str
    referral_count: int
    already_on_list: bool = False


class WaitlistCountResponse(BaseModel):
    count: int


class WaitlistReferrerResponse(BaseModel):
    """Public lookup for the "You were invited by ..." banner. First name only —
    codes are guessable in principle, so this exposes as little as possible."""
    name: str


class WaitlistTopReferrer(BaseModel):
    name: str
    referral_code: str
    referral_count: int
    position: Optional[int]


class WaitlistStatsResponse(BaseModel):
    total: int
    # Multi-select, so these counts sum to MORE than `total` — each person is
    # counted once per activity they picked.
    by_preferred_activity: Dict[str, int]
    # Free text from everyone who chose "Something else", most common first.
    # The demand signal for categories we don't list yet.
    other_activities: Dict[str, int]
    by_area: Dict[str, int]
    top_referrers: List[WaitlistTopReferrer]
