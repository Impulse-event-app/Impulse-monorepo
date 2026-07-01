// Typed API client — automatically attaches the Supabase Bearer token.
// Token is injected by AuthProvider via _setAccessToken() on every
// onAuthStateChange event — more reliable than calling getSession() at
// request time, which can return a stale/unrefreshed token.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let _accessToken: string | null = null;

/** Called by AuthProvider whenever the Supabase session changes. */
export function _setAccessToken(token: string | null) {
  _accessToken = token;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }
  return headers;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers = getHeaders();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // Capture error detail from the API if available
    let detail = res.statusText;
    try {
      const json = await res.json();
      detail = json.detail ?? detail;
    } catch {
      // ignore parse errors
    }
    const err = new ApiError(res.status, detail);
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Raw fetch with full Response — used for redeem where we need headers + status
export function rawRequest(
  method: string,
  path: string
): Promise<Response> {
  const headers = getHeaders();
  return fetch(`${BASE}${path}`, { method, headers });
}

// ── Venues ───────────────────────────────────────────────────────────────────

export interface Venue {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  description: string | null;
  address: string | null;
  suburb: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  opening_hours: string | null;
  is_active: boolean;
  avg_rating: number;
  total_ratings: number;
  created_at: string;
}

export interface VenueCreate {
  name: string;
  category: string;
  description?: string;
  address?: string;
  suburb?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  email?: string;
  website?: string;
  opening_hours?: string;
}

export interface VenueUpdate extends Partial<VenueCreate> {
  is_active?: boolean;
}

export interface StatsResponse {
  active_deals: number;
  bookings_today: number;
  revenue_today: number;
  spots_filled: number;
  total_spots: number;
}

export const venueApi = {
  create: (body: VenueCreate) =>
    request<Venue>("POST", "/venues", body),
  get: (id: string) =>
    request<Venue>("GET", `/venues/${id}`),
  update: (id: string, body: VenueUpdate) =>
    request<Venue>("PATCH", `/venues/${id}`, body),
  stats: (id: string) =>
    request<StatsResponse>("GET", `/venues/${id}/stats`),
  deals: (id: string) =>
    request<Deal[]>("GET", `/venues/${id}/deals`),
};

// ── Deals ─────────────────────────────────────────────────────────────────────

export interface Deal {
  id: string;
  venue_id: string;
  title: string;
  category: string;
  description: string | null;
  unit: string | null;
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
}

export interface DealCreate {
  venue_id: string;
  title: string;
  category: string;
  description?: string;
  unit?: string;
  original_price: number;
  discount_pct: number;
  date: string;
  slots: string[];
  max_group_size?: number;
  total_spots: number;
  is_active?: boolean;
  expires_at?: string;
}

export interface DealUpdate {
  title?: string;
  category?: string;
  description?: string;
  unit?: string;
  original_price?: number;
  discount_pct?: number;
  date?: string;
  slots?: string[];
  max_group_size?: number;
  total_spots?: number;
  is_active?: boolean;
  expires_at?: string;
}

export const dealApi = {
  create: (body: DealCreate) =>
    request<Deal>("POST", "/deals", body),
  get: (id: string) =>
    request<Deal>("GET", `/deals/${id}`),
  update: (id: string, body: DealUpdate) =>
    request<Deal>("PATCH", `/deals/${id}`, body),
  delete: (id: string) =>
    request<void>("DELETE", `/deals/${id}`),
};

// ── Bookings ──────────────────────────────────────────────────────────────────

export interface Booking {
  id: string;
  deal_id: string;
  user_id: string;
  slot_time: string;
  num_people: number;
  total_paid: number;
  confirmation_code: string;
  status: "pending" | "confirmed" | "cancelled" | "attended";
  redeemed_at: string | null;
  created_at: string;
}

export interface RedeemResponse {
  confirmation_code: string;
  status: string;
  slot_time: string;
  num_people: number;
  redeemed_at: string | null;
}

export const bookingApi = {
  listForDeal: (dealId: string) =>
    request<Booking[]>("GET", `/bookings?deal_id=${dealId}`),
  redeem: (code: string) =>
    rawRequest("POST", `/bookings/redeem/${encodeURIComponent(code)}`),
};
