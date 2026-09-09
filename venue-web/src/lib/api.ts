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
  image_url: string | null;
  accessibility_features: string[];
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
  image_url?: string;
  accessibility_features?: string[];
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

// ── Payouts ───────────────────────────────────────────────────────────────────

export interface PayoutLine {
  booking_id: string | null;
  confirmation_code: string | null;
  deal_title: string | null;
  kind: "deposit" | "balance" | null;
  line_type: string | null;
  amount_cents: number;
  transaction_date: string | null;
}

export interface Payout {
  id: string;
  pinch_transfer_id: string;
  status: string;
  reference: string | null;
  currency: string;
  /** This venue's share of the transfer, not the whole transfer. */
  amount_cents: number;
  transfer_net_cents: number;
  transfer_date: string | null;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
  lines: PayoutLine[];
}

export interface PayoutSummary {
  paid_cents: number;
  in_transit_cents: number;
  awaiting_cents: number;
  payout_count: number;
  last_payout_date: string | null;
}

export interface PayoutsResponse {
  summary: PayoutSummary;
  payouts: Payout[];
}

/** One finished deal, scored on how well it sold. */
export interface DealPerformanceItem {
  deal_id: string;
  title: string;
  category: string;
  discount_pct: number;
  date: string;
  slots: string[];
  total_spots: number;
  spots_filled: number;
  fill_rate: number; // 0–100
  bookings: number;
  minutes_to_last_booking: number | null;
}

export const venueApi = {
  create: (body: VenueCreate) =>
    request<Venue>("POST", "/venues", body),
  mine: () =>
    request<Venue>("GET", "/venues/mine"),
  /** Every venue the signed-in owner has. [] when they have none yet. */
  mineAll: () =>
    request<Venue[]>("GET", "/venues/mine/all"),
  get: (id: string) =>
    request<Venue>("GET", `/venues/${id}`),
  update: (id: string, body: VenueUpdate) =>
    request<Venue>("PATCH", `/venues/${id}`, body),
  stats: (id: string) =>
    request<StatsResponse>("GET", `/venues/${id}/stats`),
  deals: (id: string) =>
    request<Deal[]>("GET", `/venues/${id}/deals`),
  dealPerformance: (id: string, limit = 10) =>
    request<DealPerformanceItem[]>("GET", `/venues/${id}/deal-performance?limit=${limit}`),
  payouts: (id: string) =>
    request<PayoutsResponse>("GET", `/venues/${id}/payouts`),
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
  confirmation_code: string | null; // null until the Pinch deposit is paid
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
  payment_status: "unpaid" | "deposit_paid" | "fully_paid" | "cancelled";
  balance_amount_cents: number | null;
  // Set when the balance charge declined — collect payment directly
  payment_warning: string | null;
}

export const bookingApi = {
  listForDeal: (dealId: string) =>
    request<Booking[]>("GET", `/bookings?deal_id=${dealId}`),
  redeem: (code: string) =>
    rawRequest("POST", `/bookings/redeem/${encodeURIComponent(code)}`),
};

// ── Huddles (group verification) ──────────────────────────────────────────────

export interface HuddleVerifyMember {
  name: string;
  balance_cents: number;
  balance_status: "unpaid" | "paid" | "declined";
}

export interface HuddleVerifyResponse {
  huddle_id: string;
  group_size: number;
  venue_name: string;
  deal_title: string;
  slot: string;
  total_balance_cents: number;
  members: HuddleVerifyMember[];
  status: string;
  already_redeemed: boolean;
}

export interface HuddleRedeemMemberResult {
  name: string;
  balance_cents: number;
  status: "paid" | "declined";
  warning: string | null;
}

export interface HuddleRedeemResponse {
  huddle_id: string;
  redeemed: boolean;
  members: HuddleRedeemMemberResult[];
  total_charged_cents: number;
  declines: number;
}

export const huddleApi = {
  // Preview a group code (no charge). rawRequest so 404 (not a huddle code) can
  // fall through to the booking-redeem path without throwing.
  verify: (code: string) =>
    rawRequest("GET", `/huddles/verify/${encodeURIComponent(code)}`),
  redeem: (code: string) =>
    request<HuddleRedeemResponse>("POST", `/huddles/redeem/${encodeURIComponent(code)}`),
};

// ── Pinch managed merchant onboarding ────────────────────────────────────────

export type ContactType = "owner" | "director" | "shareholder" | "executive";

export type DocumentType =
  | "identity-document"
  | "financial-document"
  | "business-registration"
  | "additional-verification";

export interface MerchantContactInput {
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  contact_type: ContactType;
  is_primary_contact: boolean;
  is_ubo: boolean;
  ownership: number | null;
  dob: string | null;
  street_address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export interface OnboardingDraft {
  company_name: string | null;
  legal_entity_name: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_website_url: string | null;
  abn: string | null;
  nature_of_business: string | null;
  organisation_type: string | null;
  legal_street_address: string | null;
  legal_suburb: string | null;
  legal_state: string | null;
  legal_postcode: string | null;
  legal_country: string | null;
  bank_account_name: string | null;
  bank_bsb: string | null;
  /** Write-only. Always null when read back — the API never returns it. */
  bank_account_number: string | null;
  bank_account_last3?: string | null;
  afsl_held: boolean | null;
  afsl_number: string | null;
  austrac_registered: boolean | null;
  shares_held_in_trust: boolean | null;
  contacts: MerchantContactInput[];
  completed_steps: string[];
}

export interface MerchantDocument {
  id: string;
  document_type: DocumentType;
  pinch_contact_id: string | null;
  label: string;
  created_at: string;
}

export interface MerchantContact {
  contact_id: string;
  contact_type: ContactType;
  first_name: string | null;
  last_name: string | null;
  ownership: number | null;
  is_ubo: boolean;
  is_primary_contact: boolean;
}

export interface MerchantCompliance {
  venue_id: string;
  pinch_merchant_id: string | null;
  compliance_status: string | null;
  submission_status: string | null;
  merchant_status: string | null;
  compliance_notes: string | null;
  updated_at: string | null;
  live_enabled: boolean;
  transactions_enabled: boolean;
  settlements_enabled: boolean;
  can_publish_deals: boolean;
  contacts: MerchantContact[];
  documents: MerchantDocument[];
  outstanding: string[];
}

export const merchantApi = {
  getDraft: (venueId: string) =>
    request<OnboardingDraft>("GET", `/merchants/venues/${venueId}/onboarding`),
  saveDraft: (venueId: string, body: Partial<OnboardingDraft>) =>
    request<OnboardingDraft>("PUT", `/merchants/venues/${venueId}/onboarding`, body),
  create: (venueId: string) =>
    request<MerchantCompliance>("POST", `/merchants/venues/${venueId}`),
  status: (venueId: string) =>
    request<MerchantCompliance>("GET", `/merchants/venues/${venueId}/status`),

  /**
   * Multipart upload. Deliberately not routed through request(): getHeaders()
   * sets Content-Type: application/json, and for a FormData body the browser has
   * to set it itself so it can append the multipart boundary.
   */
  uploadDocument: async (
    venueId: string,
    documentType: DocumentType,
    file: File,
    contactId?: string | null
  ): Promise<MerchantDocument> => {
    const form = new FormData();
    form.append("document_type", documentType);
    if (contactId) form.append("contact_id", contactId);
    form.append("file", file);

    const headers: Record<string, string> = {};
    if (_accessToken) headers["Authorization"] = `Bearer ${_accessToken}`;

    const res = await fetch(`${BASE}/merchants/venues/${venueId}/documents`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        detail = (await res.json()).detail ?? detail;
      } catch {
        // ignore parse errors
      }
      throw new ApiError(res.status, detail);
    }
    return res.json() as Promise<MerchantDocument>;
  },
};
