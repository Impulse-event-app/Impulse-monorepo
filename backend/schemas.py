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
    pinch_merchant_id: Optional[str] = None
    pinch_submission_status: Optional[str] = None
    pinch_merchant_status: Optional[str] = None


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

class SeatCover(BaseModel):
    """At creation seats are addressed by index (0 = the initiator)."""
    covered: int
    coverer: int


class BookingCreate(BaseModel):
    """A booking for num_people. Without `split`, the person booking pays for
    everyone (one payer, whole total). With `split` (Huddle Pay), there's one
    seat per person, each with its own share and invite; `amounts` (custom
    mode) are final per-seat cents, index 0 is the initiator; covered seats
    are 0 and listed in `covers`."""
    deal_id: str
    slot_time: str
    num_people: int
    split: bool = False
    split_mode: Literal["even", "custom"] = "even"
    amounts: Optional[List[int]] = None
    covers: List[SeatCover] = []
    seat_labels: Optional[List[Optional[str]]] = None   # e.g. [None, "Sam", "Alex"]


class BookingPay(BaseModel):
    """How to pay a deposit share — either a saved card or a fresh CaptureJs token.

    Exactly one of `payment_method_id` (charge a card already on file) or
    `token` (a new card) must be supplied. With `token`, `save_card` decides
    whether it is kept on file afterwards; the payer/card details are only
    needed on that path.

    `expected_deposit_cents` is the amount the payer was shown when they
    tapped confirm. The server charges it only if it still matches their
    stored share — the amount charged is always the amount consented to."""
    expected_deposit_cents: int
    payment_method_id: Optional[str] = None
    token: Optional[str] = None
    save_card: bool = False
    card_holder_name: Optional[str] = None
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    @model_validator(mode="after")
    def _one_payment_path(self):
        if bool(self.payment_method_id) == bool(self.token):
            raise ValueError("Supply exactly one of payment_method_id or token")
        if self.token and not (self.email and self.first_name and self.last_name):
            raise ValueError("first_name, last_name and email are required with a new card")
        return self


class PaymentMethodResponse(BaseModel):
    """A card on file. `display_card_number` is the bare last 4 and
    `card_scheme` is lowercase, exactly as Pinch returns them — the client
    builds the mask and title-cases the scheme."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    card_scheme: Optional[str]
    display_card_number: Optional[str]
    expiry_date: Optional[str]
    card_holder_name: Optional[str]
    funding: Optional[str]
    is_default: bool
    created_at: datetime


class PaymentMethodCreate(BaseModel):
    """Save a card to the user's wallet from a CaptureJs token."""
    token: str
    first_name: str
    last_name: str
    email: str
    make_default: bool = True


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    deal_id: Optional[str]             # null only while a Huddle is voting
    user_id: Optional[str]             # null once the customer has deleted their account
    slot_time: Optional[str]
    num_people: int
    total_paid: float
    confirmation_code: Optional[str]   # null until the deposit is paid
    status: str
    redeemed_at: Optional[datetime]
    created_at: datetime
    # The caller's own seat (the whole booking for a solo booking).
    deposit_amount_cents: Optional[int] = None
    balance_amount_cents: Optional[int] = None
    payment_status: str = "unpaid"          # unpaid | deposit_paid | fully_paid
    payment_note: Optional[str] = None      # customer-facing charge outcome
    payment_followup: bool = False
    has_voting: bool = False
    is_split: bool = False                  # Huddle Pay: one seat per person
    my_member_id: Optional[str] = None

    @staticmethod
    def seat_fields(b: object, user_id: Optional[str]) -> dict:
        """Payment fields for `user_id`'s seat, falling back to the initiator's."""
        seats = b.participants  # type: ignore[attr-defined]
        me = next((p for p in seats if user_id and p.user_id == user_id), None) or next(
            (p for p in seats if p.id == b.initiator_member_id), None)  # type: ignore[attr-defined]
        if me is None:
            return {}
        status = "unpaid"
        if me.deposit_status in ("paid", "guaranteed", "settled"):
            status = "fully_paid" if me.balance_status == "paid" else "deposit_paid"
        return dict(
            deposit_amount_cents=me.deposit_cents,
            balance_amount_cents=me.balance_cents,
            payment_status=status,
            payment_note=me.payment_note,
            payment_followup=me.payment_followup,
            my_member_id=me.id,
            is_split=len(seats) > 1,
        )


class BookingWithDetailsResponse(BookingResponse):
    """Extends BookingResponse with deal + venue info for the Plans screen."""
    venue_id: str
    venue_name: str
    deal_title: str
    deal_category: str

    @classmethod
    def from_booking(cls, booking: object, user_id: Optional[str] = None) -> "BookingWithDetailsResponse":
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
            has_voting=b.has_voting,
            **cls.seat_fields(b, user_id),
            venue_id=b.deal.venue_id,
            venue_name=b.deal.venue.name,
            deal_title=b.deal.title,
            deal_category=b.deal.category,
        )


class VerifyMember(BaseModel):
    name: str
    balance_cents: int
    balance_status: str            # unpaid | paid | declined


class VerifyResponse(BaseModel):
    """Preview shown to venue staff before confirming — no money moves."""
    booking_id: str
    confirmation_code: str
    group_size: int
    venue_name: str
    deal_title: str
    slot: str
    total_balance_cents: int
    members: List[VerifyMember]
    status: str
    already_redeemed: bool
    redeemed_at: Optional[datetime] = None


class RedeemMemberResult(BaseModel):
    name: str
    balance_cents: int
    status: str                    # paid | declined
    warning: Optional[str] = None  # "collect $X from {name} directly"


class RedeemResponse(BaseModel):
    """Returned to the venue when they confirm a code — solo or group."""
    booking_id: str
    confirmation_code: str
    status: str
    slot_time: Optional[str]
    num_people: int
    redeemed_at: Optional[datetime]
    members: List[RedeemMemberResult]
    total_charged_cents: int
    declines: int


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


class DealPerformanceItem(BaseModel):
    """One completed deal, scored on how well it sold. `date`/`slots` are the
    raw display strings — venue-web renders the time window from them."""

    deal_id: str
    title: str
    category: str
    discount_pct: float
    date: str
    slots: List[str]
    total_spots: int
    spots_filled: int
    fill_rate: float                            # 0–100, 1dp
    bookings: int
    minutes_to_last_booking: Optional[int]      # deal created_at → newest booking


# ── Split bookings (direct + Huddle share one view) ───────────────────────────

class HuddleCreate(BaseModel):
    group_size: int   # 2–10
    display_name: Optional[str] = None   # creator's name; falls back to profile


class HuddleJoin(BaseModel):
    display_name: Optional[str] = None   # falls back to the profile name


class BallotSubmit(BaseModel):
    """Ordered deal ids, best first. Up to 3; must all be current candidates."""
    picks: List[str]


class PushTokenRegister(BaseModel):
    expo_push_token: str


class UserSearchResult(BaseModel):
    """Just enough to pick the right friend — never their email or phone."""
    id: str
    display_name: str
    recent: bool = False         # you've been in a booking together before


class SeatInvite(BaseModel):
    user_id: str


class SplitEdit(BaseModel):
    """Initiator re-splits the seats that haven't paid. `amounts` (custom) are
    final per-seat cents keyed by member id; `covers` maps covered → coverer."""
    split_mode: Literal["even", "custom"]
    amounts: Optional[Dict[str, int]] = None
    covers: Dict[str, str] = {}


class CoverRequest(BaseModel):
    covered_member_id: str


class MyShare(BaseModel):
    share_cents: int
    deposit_cents: int              # charged on confirm — exactly this
    balance_cents: int              # charged when the venue scans the code
    status: str                     # unpaid | paid | guaranteed | settled | refunded | declined
    covered_by_name: Optional[str] = None


class ParticipantPublic(BaseModel):
    """What any participant may see about another. Ballots stay sealed — only
    has_voted is exposed. Amounts are shown to the initiator (who set them)
    and to each person for their own seat, never broadcast to the group."""
    id: str
    display_name: str
    seat_label: Optional[str] = None
    is_initiator: bool
    is_me: bool
    claimed: bool                   # a person holds this seat (invited or opened)
    invited: bool = False           # saved for someone who hasn't opened it yet
    has_voted: bool
    state: str                      # waiting | paid | covered | guaranteed | refunded | declined
    share_cents: Optional[int] = None
    seat_token: Optional[str] = None     # initiator only, for unclaimed seats' links


class BookingView(BaseModel):
    id: str
    has_voting: bool
    status: str                     # voting | collecting | confirmed | redeemed | cancelled | expired | collapsed
    group_size: int
    split_mode: str
    split_confirmed: bool
    locked_price_cents: Optional[int]
    slot_time: Optional[str]
    share_deadline: Optional[datetime]
    voting_deadline: Optional[datetime]
    join_token: Optional[str]            # Huddle invite link, voting stage only
    initiator_name: str
    # The person booking has paid their share, so the slot is held and
    # everyone else can pay. Before that, invitees can see the plan only.
    locked_in: bool
    deal: Optional[DealWithVenueResponse]
    # Set once every share is in — identical for every participant.
    confirmation_code: Optional[str]
    participants: List[ParticipantPublic]
    paid_count: int
    # Direct bookings: what would fall to the initiator's card if nobody else
    # paid from here. Counts down as shares land. Null for Huddles.
    initiator_exposure_cents: Optional[int]
    created_at: datetime
    my_member_id: Optional[str] = None
    is_initiator: bool = False
    my_has_voted: bool = False
    my_share: Optional[MyShare] = None


class SeatLanding(BaseModel):
    """What a participant sees when they open their seat link — an invitation,
    with their exact share."""
    booking_id: str
    member_id: str
    initiator_name: str
    venue_name: str
    deal_title: str
    slot: str
    share: MyShare
    booking_status: str
    locked_in: bool
    share_deadline: Optional[datetime]


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


# ── Venue enquiry (landing page "For venues" form) ────────────────────────────
# Not persisted — the email is the record — so this only has to be enough for a
# human to act on and tight enough that a bot cannot post an essay.

class VenueEnquiryCreate(BaseModel):
    venue: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254, pattern=EMAIL_PATTERN)
    phone: Optional[str] = Field(default=None, max_length=40)
    message: Optional[str] = Field(default=None, max_length=2000)
    # Honeypot. No human sees this field; naive bots fill every input they find,
    # so anything here means the submission is not a person.
    website: Optional[str] = Field(default=None, max_length=200)


# ── Pinch managed merchant onboarding ─────────────────────────────────────────
#
# The onboarding draft is stored as free-form JSON on the venue so a half-finished
# form survives a device change, but the pieces that become a Pinch payload are
# typed here so a malformed draft fails at submit rather than at Pinch.

DOCUMENT_TYPES = (
    "identity-document", "financial-document",
    "business-registration", "additional-verification",
)


class MerchantContactInput(BaseModel):
    """A director, owner or UBO. Pinch requires email, contactType and
    isPrimaryContact; the rest materially improves the odds of passing review."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    contact_type: Literal["owner", "director", "shareholder", "executive"]
    is_primary_contact: bool = False
    is_ubo: bool = False
    ownership: Optional[float] = Field(default=None, ge=0, le=100)
    dob: Optional[str] = None                       # ISO yyyy-mm-dd
    street_address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = "AU"


class OnboardingDraft(BaseModel):
    """Every step's fields, all optional — this is saved partially filled."""

    # Business details
    company_name: Optional[str] = None
    legal_entity_name: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_website_url: Optional[str] = None
    abn: Optional[str] = None
    nature_of_business: Optional[str] = None
    organisation_type: Optional[str] = None
    legal_street_address: Optional[str] = None
    legal_suburb: Optional[str] = None
    legal_state: Optional[str] = None
    legal_postcode: Optional[str] = None
    legal_country: Optional[str] = "AU"

    # Bank
    bank_account_name: Optional[str] = None
    bank_bsb: Optional[str] = None
    bank_account_number: Optional[str] = None       # write-only; never read back

    # Declarations
    afsl_held: Optional[bool] = None
    afsl_number: Optional[str] = None
    austrac_registered: Optional[bool] = None
    shares_held_in_trust: Optional[bool] = None

    # People
    contacts: List[MerchantContactInput] = Field(default_factory=list)

    completed_steps: List[str] = Field(default_factory=list)


class OnboardingDraftRead(OnboardingDraft):
    """What a GET returns. Overrides bank_account_number to a masked stand-in so
    the real number cannot be read back out of the draft it was saved into."""

    bank_account_number: Optional[str] = None       # always None on read
    bank_account_last3: Optional[str] = None


class MerchantDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_type: str
    pinch_contact_id: Optional[str]
    label: str
    created_at: datetime


class MerchantComplianceResponse(BaseModel):
    """Venue-facing onboarding state: what Pinch says, plus what is still missing."""

    venue_id: str
    pinch_merchant_id: Optional[str] = None
    compliance_status: Optional[str] = None
    submission_status: Optional[str] = None
    merchant_status: Optional[str] = None
    compliance_notes: Optional[str] = None
    updated_at: Optional[datetime] = None
    live_enabled: bool = False
    transactions_enabled: bool = False
    settlements_enabled: bool = False
    can_publish_deals: bool = True
    contacts: List[Dict] = Field(default_factory=list)
    documents: List[MerchantDocumentResponse] = Field(default_factory=list)
    outstanding: List[str] = Field(default_factory=list)
