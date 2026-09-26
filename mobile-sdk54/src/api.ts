// api.ts — Impulse: typed HTTP client for the FastAPI backend.
//
// Every request automatically attaches the current Supabase access token as a
// Bearer token. The backend verifies this JWT via Supabase's JWKS (RS256).
//
// Set EXPO_PUBLIC_API_URL in your .env (e.g. http://localhost:8000 for dev).
// In production point it at your deployed FastAPI server.

import { supabase } from './supabase';

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

// ── internal helpers ─────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new ApiError('Not authenticated', 401);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(body.detail ?? 'API error', res.status);
  }
  // 204 No Content → return undefined cast to T
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Like request() but attaches the token only if a session exists — for public endpoints. */
async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(body.detail ?? 'API error', res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── types (mirror backend schemas.py) ───────────────────────

export type UserProfile = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  avatar_url: string | null;
  home_suburb: string | null;
  preferred_acts: string[];
  accessibility_needs: string[];
  party_size: number;
  age_bracket: number | null;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type UserProfileUpdate = Partial<
  Pick<UserProfile, 'full_name' | 'avatar_url' | 'home_suburb' | 'preferred_acts' | 'accessibility_needs' | 'party_size' | 'age_bracket' | 'notifications_enabled'>
>;

export type ApiDeal = {
  id: string;
  venue_id: string;
  // venue fields (joined by the server)
  venue_name: string;
  venue_address: string | null;
  venue_suburb: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_avg_rating: number;
  venue_image_url: string | null;
  // deal fields
  title: string;
  category: string;
  description: string | null;
  unit: string | null;          // pricing unit, e.g. "pp", "/lane", "/room·hr"
  original_price: number;
  discount_pct: number;
  deal_price: number;
  date: string;
  slots: string[];
  max_group_size: number;
  total_spots: number;
  spots_remaining: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

export type ApiBooking = {
  id: string;
  deal_id: string;
  user_id: string | null;
  // joined fields
  venue_name: string;
  venue_id: string;
  deal_title: string;
  deal_category: string;
  // booking fields
  slot_time: string;
  num_people: number;
  total_paid: number;
  confirmation_code: string | null;   // null until every share is in
  status: BookingStatus;
  redeemed_at: string | null;
  created_at: string;
  // payment fields — the caller's own seat
  deposit_amount_cents: number | null;
  balance_amount_cents: number | null;
  payment_status: 'unpaid' | 'deposit_paid' | 'fully_paid';
  payment_note: string | null;        // charge outcome shown in-app
  payment_followup: boolean;
  has_voting: boolean;
  is_split: boolean;                  // Huddle Pay: one seat per person
  my_member_id: string | null;
};

/** One lifecycle for every booking — solo, direct split and Huddle. */
export type BookingStatus =
  | 'voting' | 'collecting' | 'confirmed' | 'redeemed' | 'cancelled' | 'expired' | 'collapsed';

export type SplitMode = 'even' | 'custom';

/** At creation seats are addressed by index; 0 is the person booking. */
export type SeatCover = { covered: number; coverer: number };

export type BookingCreate = {
  deal_id: string;
  slot_time: string;
  num_people: number;
  split?: boolean;                     // Huddle Pay; otherwise I pay for everyone
  split_mode?: SplitMode;
  amounts?: number[];                  // custom: final cents per seat, summing to the locked total
  covers?: SeatCover[];
  seat_labels?: (string | null)[];
};

/** Pay with a card on file, or with a new one. Exactly one of
 *  `payment_method_id` / `token` — the server rejects both or neither.
 *  `expected_deposit_cents` is the amount on screen when the person tapped
 *  confirm; the server charges it only if it still matches their share. */
export type BookingPay = {
  expected_deposit_cents: number;
  payment_method_id?: string;
  token?: string;             // CaptureJs card token — never raw card details
  save_card?: boolean;        // keep a new card on file for next time
  card_holder_name?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
};

/** A card the user has kept on file. `display_card_number` is the bare last 4
 *  and `card_scheme` is lowercase, exactly as Pinch returns them. */
export type PaymentMethod = {
  id: string;
  card_scheme: string | null;
  display_card_number: string | null;
  expiry_date: string | null;
  card_holder_name: string | null;
  funding: string | null;
  is_default: boolean;
  created_at: string;
};

/** "visa" + "4654" → "Visa •••• 4654". */
export function describeCard(m: PaymentMethod): string {
  const scheme = m.card_scheme
    ? m.card_scheme.charAt(0).toUpperCase() + m.card_scheme.slice(1)
    : 'Card';
  return m.display_card_number ? `${scheme} •••• ${m.display_card_number}` : scheme;
}

export type InteractionType = 'view' | 'save' | 'booking' | 'rating';

// ── users ────────────────────────────────────────────────────

/** Fetch the signed-in user's profile. Throws ApiError(404) if not yet created. */
export async function getMe(): Promise<UserProfile> {
  return request<UserProfile>('/users/me');
}

/** Update the signed-in user's profile fields. */
export async function patchMe(updates: UserProfileUpdate): Promise<UserProfile> {
  return request<UserProfile>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * Permanently delete the signed-in user's account: profile, saved cards and
 * sign-in identity. Past bookings are kept, anonymised, for accounting.
 * Throws ApiError(409) if the account owns a venue.
 */
export async function deleteMe(): Promise<void> {
  await request<void>('/users/me', { method: 'DELETE' });
}

// ── deals ────────────────────────────────────────────────────

export type DealFilters = {
  suburb?: string;
  category?: string;
  date?: string;
  active_only?: boolean;
};

/** List active deals, with optional filters. Public endpoint — no login required. */
export async function listDeals(filters: DealFilters = {}): Promise<ApiDeal[]> {
  const params = new URLSearchParams();
  if (filters.suburb) params.set('suburb', filters.suburb);
  if (filters.category) params.set('category', filters.category);
  if (filters.date) params.set('date', filters.date);
  if (filters.active_only !== undefined) params.set('active_only', String(filters.active_only));
  const qs = params.toString();
  return publicRequest<ApiDeal[]>(`/deals${qs ? `?${qs}` : ''}`);
}

/** Fetch a single deal by ID. */
export async function getDeal(dealId: string): Promise<ApiDeal> {
  return request<ApiDeal>(`/deals/${dealId}`);
}

// ── bookings ─────────────────────────────────────────────────

/** Reserve a slot. The booking is unpaid and has NO code until payBooking succeeds. */
export async function createBooking(body: BookingCreate): Promise<ApiBooking> {
  return request<ApiBooking>('/bookings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Pay my deposit share via Pinch. A solo booking comes back WITH its 6-digit code;
 *  a split booking gets its code once every share is in. */
export async function payBooking(bookingId: string, body: BookingPay): Promise<ApiBooking> {
  return request<ApiBooking>(`/bookings/${bookingId}/pay`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ── Saved cards ──────────────────────────────────────────────────────────────

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  return request<PaymentMethod[]>('/users/me/payment-methods');
}

export async function addPaymentMethod(body: {
  token: string;
  first_name: string;
  last_name: string;
  email: string;
  make_default?: boolean;
}): Promise<PaymentMethod> {
  return request<PaymentMethod>('/users/me/payment-methods', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deletePaymentMethod(methodId: string): Promise<void> {
  await request<void>(`/users/me/payment-methods/${encodeURIComponent(methodId)}`, {
    method: 'DELETE',
  });
}

/** Cancel a booking. The deposit is always forfeited — no refunds. */
export async function cancelBooking(
  bookingId: string,
): Promise<{ cancelled: boolean; depositForfeited: boolean; depositAmountCents: number }> {
  return request(`/bookings/${bookingId}/cancel`, { method: 'POST' });
}

/** Fetch all bookings belonging to the signed-in user. */
export async function getMyBookings(): Promise<ApiBooking[]> {
  return request<ApiBooking[]>('/bookings/me');
}

// ── interactions ─────────────────────────────────────────────

/** Log a user–venue interaction (view, save, booking, rating). Fire-and-forget safe. */
export async function logInteraction(
  venueId: string,
  eventType: InteractionType,
  rating?: number,
): Promise<void> {
  await request<void>('/interactions', {
    method: 'POST',
    body: JSON.stringify({ venue_id: venueId, event_type: eventType, rating }),
  });
}

// ── split bookings (direct + Huddle share one view) ─────────

export type MyShare = {
  share_cents: number;
  deposit_cents: number;          // charged on confirm — exactly this
  balance_cents: number;          // charged when the venue scans the code
  status: 'unpaid' | 'paid' | 'guaranteed' | 'settled' | 'refunded' | 'declined';
  covered_by_name: string | null;
};

export type ParticipantState = 'waiting' | 'paid' | 'covered' | 'settled' | 'guaranteed' | 'refunded' | 'declined';

/** What anyone in the booking sees about anyone else. Amounts only appear
 *  for your own seat, or for everyone if you're the one who booked. */
export type Participant = {
  id: string;
  display_name: string;
  seat_label: string | null;
  is_initiator: boolean;
  is_me: boolean;
  claimed: boolean;               // someone holds this seat (invited or opened)
  invited: boolean;               // saved for someone who hasn't opened it yet
  has_voted: boolean;
  state: ParticipantState;
  share_cents: number | null;
  seat_token: string | null;      // initiator only, for unclaimed seats
};

export type ApiBookingView = {
  id: string;
  has_voting: boolean;
  status: BookingStatus;
  group_size: number;
  split_mode: SplitMode;
  split_confirmed: boolean;
  locked_price_cents: number | null;
  slot_time: string | null;
  share_deadline: string | null;
  voting_deadline: string | null;
  join_token: string | null;      // Huddle invite, voting stage only
  initiator_name: string;
  locked_in: boolean;             // the person booking has paid — everyone else can pay
  deal: ApiDeal | null;
  confirmation_code: string | null;   // identical for everyone, once all shares are in
  participants: Participant[];
  paid_count: number;
  initiator_exposure_cents: number | null;   // direct bookings: still to come in
  created_at: string;
  my_member_id: string | null;
  is_initiator: boolean;
  my_has_voted: boolean;
  my_share: MyShare | null;
};

/** A Huddle is a booking with a voting stage — same view. */
export type ApiHuddle = ApiBookingView;

export type SeatLanding = {
  booking_id: string;
  member_id: string;
  initiator_name: string;
  venue_name: string;
  deal_title: string;
  slot: string;
  share: MyShare;
  booking_status: BookingStatus;
  locked_in: boolean;
  share_deadline: string | null;
};

/** The live meter for anyone in the booking. */
export async function getSplit(bookingId: string): Promise<ApiBookingView> {
  return request<ApiBookingView>(`/bookings/${encodeURIComponent(bookingId)}/split`);
}

/** Initiator: choose/replace the split for seats that haven't paid. On a
 *  Huddle this is also how the creator confirms the split. */
export async function editSplit(
  bookingId: string,
  body: { split_mode: SplitMode; amounts?: Record<string, number>; covers?: Record<string, string> },
): Promise<ApiBookingView> {
  return request<ApiBookingView>(`/bookings/${encodeURIComponent(bookingId)}/split`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** Cover someone's share — it's added to mine, they owe nothing. */
export async function coverShare(bookingId: string, coveredMemberId: string): Promise<ApiBookingView> {
  return request<ApiBookingView>(`/bookings/${encodeURIComponent(bookingId)}/cover`, {
    method: 'POST',
    body: JSON.stringify({ covered_member_id: coveredMemberId }),
  });
}

/** Initiator: take a seat out; the group shrinks and unpaid shares re-split. */
export async function removeSeat(bookingId: string, memberId: string): Promise<ApiBookingView> {
  return request<ApiBookingView>(
    `/bookings/${encodeURIComponent(bookingId)}/seats/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' },
  );
}

/** Open a seat link: the seat becomes mine and I see my exact share. */
export async function claimSeat(seatToken: string): Promise<SeatLanding> {
  return request<SeatLanding>(`/bookings/seat/${encodeURIComponent(seatToken)}/claim`, { method: 'POST' });
}

/** Someone on Impulse to invite — a name only, never their contact details. */
export type UserSearchResult = { id: string; display_name: string; recent: boolean };

/** Find a friend by name (3+ letters), or exact email/phone. Empty query →
 *  people you've booked with before. */
export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return request<UserSearchResult[]>(`/users/search${qs}`);
}

/** Initiator: save a seat for a friend on Impulse — they get a push and it
 *  shows in their Plans. */
export async function inviteToSeat(bookingId: string, memberId: string, userId: string): Promise<ApiBookingView> {
  return request<ApiBookingView>(
    `/bookings/${encodeURIComponent(bookingId)}/seats/${encodeURIComponent(memberId)}/invite`,
    { method: 'POST', body: JSON.stringify({ user_id: userId }) },
  );
}

/** Invitee: can't make it — the seat opens back up. */
export async function declineSeat(bookingId: string): Promise<void> {
  await request<void>(`/bookings/${encodeURIComponent(bookingId)}/decline`, { method: 'POST' });
}

// ── huddles (the voting stage) ───────────────────────────────

/** Start a huddle (signed-in only). Creator takes the first seat. */
export async function createHuddle(groupSize: number, displayName?: string): Promise<ApiHuddle> {
  return request<ApiHuddle>('/huddles', {
    method: 'POST',
    body: JSON.stringify({ group_size: groupSize, display_name: displayName }),
  });
}

/** Join via share link/QR token. Accounts are required; repeat joins keep the seat. */
export async function joinHuddle(joinToken: string, displayName?: string): Promise<ApiHuddle> {
  return request<ApiHuddle>(`/huddles/join/${encodeURIComponent(joinToken)}`, {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName }),
  });
}

/** Member view of a huddle — avatar states only, ballots stay sealed. */
export async function getHuddle(huddleId: string): Promise<ApiHuddle> {
  return request<ApiHuddle>(`/huddles/${encodeURIComponent(huddleId)}`);
}

/** The huddle ballot: live deals that fit the whole group. */
export async function getHuddleCandidates(huddleId: string): Promise<ApiDeal[]> {
  return request<ApiDeal[]>(`/huddles/${encodeURIComponent(huddleId)}/candidates`);
}

/** Submit this member's sealed ballot — ordered deal ids, best first (1–3). */
export async function submitBallot(huddleId: string, picks: string[]): Promise<ApiHuddle> {
  return request<ApiHuddle>(`/huddles/${encodeURIComponent(huddleId)}/ballot`, {
    method: 'POST',
    body: JSON.stringify({ picks }),
  });
}

/** Register this device's Expo push token for the signed-in user. */
export async function registerPushToken(expoPushToken: string): Promise<void> {
  await request<void>('/users/me/push-token', {
    method: 'PUT',
    body: JSON.stringify({ expo_push_token: expoPushToken }),
  });
}

/** Creator cancels the huddle. Refunds any paid deposit shares. */
export async function cancelHuddle(huddleId: string): Promise<ApiHuddle> {
  return request<ApiHuddle>(`/huddles/${encodeURIComponent(huddleId)}/cancel`, { method: 'POST' });
}
