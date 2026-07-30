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
  user_id: string;
  // joined fields
  venue_name: string;
  venue_id: string;
  deal_title: string;
  deal_category: string;
  // booking fields
  slot_time: string;
  num_people: number;
  total_paid: number;
  confirmation_code: string | null;   // null until the deposit is paid
  status: string;
  redeemed_at: string | null;
  created_at: string;
  // payment fields
  deposit_amount_cents: number | null;
  balance_amount_cents: number | null;
  payment_status: 'unpaid' | 'deposit_paid' | 'fully_paid' | 'cancelled';
  payment_note: string | null;        // balance-charge outcome shown in-app
  payment_followup: boolean;
};

export type BookingCreate = {
  deal_id: string;
  slot_time: string;
  num_people: number;
};

/** Pay with a card on file, or with a new one. Exactly one of
 *  `payment_method_id` / `token` — the server rejects both or neither. */
export type BookingPay = {
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

/** Charge the 20% deposit via Pinch. On success returns the booking WITH its 6-digit code. */
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

// ── huddles (group voting → shared booking) ──────────────────

export type HuddleMemberPublic = {
  id: string;
  display_name: string;
  is_creator: boolean;
  has_voted: boolean;
  deposit_status: 'unpaid' | 'paid' | 'refunded';
  balance_status: string;
};

export type HuddleShare = {
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
};

export type ApiHuddle = {
  id: string;
  status: 'open' | 'voting_complete' | 'awaiting_payment' | 'active' | 'expired' | 'collapsed' | 'redeemed' | 'cancelled';
  group_size: number;
  join_token: string;
  voting_deadline: string | null;
  payment_deadline: string | null;
  winning_deal_id: string | null;
  common_code: string | null;   // only present once the huddle is active
  members: HuddleMemberPublic[];
  created_at: string;
  // caller-specific — never another member's data
  my_member_id: string | null;
  my_has_voted: boolean;
  my_share: HuddleShare | null;       // set once resolved; the exact amount to charge
  winning_deal: ApiDeal | null;       // set once resolved
};

export type HuddleJoinResult = {
  huddle: ApiHuddle;
  member_id: string;
  member_token: string;   // this seat's secret — keep client-side only
};

/** Start a huddle (signed-in only). Creator takes the first seat. */
export async function createHuddle(groupSize: number, displayName?: string): Promise<HuddleJoinResult> {
  return request<HuddleJoinResult>('/huddles', {
    method: 'POST',
    body: JSON.stringify({ group_size: groupSize, display_name: displayName }),
  });
}

/** Join via share link/QR token. Works signed-in or as a guest (name required). */
export async function joinHuddle(joinToken: string, displayName?: string): Promise<HuddleJoinResult> {
  return publicRequest<HuddleJoinResult>(`/huddles/join/${encodeURIComponent(joinToken)}`, {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName }),
  });
}

/** Member view of a huddle — avatar states only, ballots stay sealed. */
export async function getHuddle(huddleId: string, memberToken?: string): Promise<ApiHuddle> {
  const qs = memberToken ? `?member_token=${encodeURIComponent(memberToken)}` : '';
  return publicRequest<ApiHuddle>(`/huddles/${encodeURIComponent(huddleId)}${qs}`);
}

/** The huddle ballot: live deals that fit the whole group. */
export async function getHuddleCandidates(huddleId: string, memberToken?: string): Promise<ApiDeal[]> {
  const qs = memberToken ? `?member_token=${encodeURIComponent(memberToken)}` : '';
  return publicRequest<ApiDeal[]>(`/huddles/${encodeURIComponent(huddleId)}/candidates${qs}`);
}

/** Submit this member's sealed ballot — ordered deal ids, best first (1–3). */
export async function submitBallot(huddleId: string, picks: string[], memberToken?: string): Promise<ApiHuddle> {
  const qs = memberToken ? `?member_token=${encodeURIComponent(memberToken)}` : '';
  return publicRequest<ApiHuddle>(`/huddles/${encodeURIComponent(huddleId)}/ballot${qs}`, {
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

/** Exactly one of `payment_method_id` / `token`. Saved cards need an account —
 *  guests who joined by name via an invite link must send a token. */
export type HuddlePayBody = {
  payment_method_id?: string;
  token?: string;
  save_card?: boolean;
  card_holder_name?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
};

/** Pay this member's deposit share of the winning deal (vault + charge). */
export async function payHuddleShare(huddleId: string, body: HuddlePayBody, memberToken?: string): Promise<ApiHuddle> {
  const qs = memberToken ? `?member_token=${encodeURIComponent(memberToken)}` : '';
  return publicRequest<ApiHuddle>(`/huddles/${encodeURIComponent(huddleId)}/pay${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Creator cancels the huddle. Refunds any paid deposit shares. */
export async function cancelHuddle(huddleId: string, memberToken?: string): Promise<ApiHuddle> {
  const qs = memberToken ? `?member_token=${encodeURIComponent(memberToken)}` : '';
  return publicRequest<ApiHuddle>(`/huddles/${encodeURIComponent(huddleId)}/cancel${qs}`, {
    method: 'POST',
  });
}
