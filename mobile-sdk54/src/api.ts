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
  party_size: number;
  age_bracket: number | null;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type UserProfileUpdate = Partial<
  Pick<UserProfile, 'full_name' | 'avatar_url' | 'home_suburb' | 'preferred_acts' | 'party_size' | 'age_bracket' | 'notifications_enabled'>
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
  confirmation_code: string;
  status: string;
  redeemed_at: string | null;
  created_at: string;
};

export type BookingCreate = {
  deal_id: string;
  slot_time: string;
  num_people: number;
};

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

/** Create a booking for a deal. Returns the confirmed booking with code. */
export async function createBooking(body: BookingCreate): Promise<ApiBooking> {
  return request<ApiBooking>('/bookings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
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
