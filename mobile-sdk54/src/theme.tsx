// theme.tsx — Impulse: theme tokens, fonts, and the app-wide state provider.
// Ported from the Impulse design handoff (app-data.jsx / app-main.jsx).
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { DEFAULT_FILTERS, Drop, Filters, Plan, apiBookingToPlan, apiDealToDrop } from './data';
import { ApiDeal, listDeals, getMyBookings } from './api';
import { supabase } from './supabase';
import { fetchUserProfile, syncUserProfile } from './auth';
import { persistDel, persistGet, persistSet } from './persist';

const ACTIVE_HUDDLE_KEY = 'impulse.activeHuddle';
const APPEARANCE_KEY = 'impulse.appearance';

// ── type ─────────────────────────────────────────────────────
// Brand v2 sets everything in the system face (SF Pro on iOS, Roboto on
// Android) at 400/500/600 only. The helpers return style fragments to spread
// into a Text style; heavier requests clamp to 600. `fontMono` is the
// numeric style — tabular figures for prices, countdowns and codes.
type Weight = 400 | 500 | 600 | 700;
type WeightStyle = { fontWeight: '400' | '500' | '600' };
const weight = (w: Weight): WeightStyle => ({ fontWeight: String(Math.min(w, 600)) as WeightStyle['fontWeight'] });
export const fontUI = (w: Weight = 400, size?: number) => ({
  ...weight(w),
  ...(size !== undefined ? { letterSpacing: tracking(size) } : {}),
});
export const fontDisplay = (w: Weight = 600) => weight(w);
/**
 * Numbers: prices, counts, countdowns, codes. Tabular figures so digits don't
 * jitter as they change. Words belong in fontUI — tabular spacing makes prose
 * look mechanical. Pass the font size (to either helper) for brand tracking.
 */
export const fontMono = (w: Weight = 400, size?: number) => ({
  ...weight(w),
  fontVariant: ['tabular-nums'] as ['tabular-nums'],
  ...(size !== undefined ? { letterSpacing: tracking(size) } : {}),
});
/**
 * Letter spacing (points) for a type size, on the brand scale: 13pt −0.05,
 * 15 −0.12, 17 −0.19, then −2% of the size from 20pt up (22 −0.44, 34 −0.68).
 * SF's default tracking is looser at small sizes, so text that skips this
 * reads airier than the tightened text around it.
 */
export function tracking(size: number): number {
  if (size >= 20) return -0.02 * size;
  if (size <= 13) return -0.05;
  return -0.05 - (size - 13) * 0.035;
}
/** Tracking in points from the design's em values. */
export const track = (size: number, em: number) => size * em;

// ── theme tokens ─────────────────────────────────────────────
export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export type Theme = {
  dark: boolean;
  bg: string;
  bgRGB: string;        // "r,g,b" of bg, for scrims
  surface: string;
  surface2: string;
  sunken: string;
  text: string;
  muted: string;        // v2 "grey" — secondary text (meets 4.5:1 on bg and surface)
  faint: string;        // v2 "grey2" — placeholders, disabled, chevrons; not for reading text
  line: string;
  line2: string;
  fill: string;         // quiet control fill (chips, steppers, inputs)
  accent: string;
  accentDeep: string;   // pressed primary
  accentInk: string;    // text on accent
  accentSoft: string;
  chipBg: string;
  chipText: string;
  chipOn: string;
  chipOnInk: string;
  mapBg: string;
  mapLine: string;
  mapBlock: string;
  ph: string;
  phLine: string;
  phText: string;
  glassTint: string;    // over a live blur
  glassSolid: string;   // where no blur is available (Android, Reduce Transparency)
  glassEdge: string;
  blurTint: 'dark' | 'light';
  shadow: object;       // v2 cards are flat — kept for call-site compat
  floatShadow: object;  // floating chrome only (tab bar, sheets)
};

// Impulse Red. The mark's ground is always this exact red (never recoloured).
export const IMPULSE_RED = '#C80815';

export function tokens(dark: boolean): Theme {
  return dark
    ? {
        dark: true,
        bg: '#0A0A0A', bgRGB: '10,10,10', surface: '#161617', surface2: '#1F1F21', sunken: '#0A0A0A',
        text: '#F5F5F7', muted: '#98989D', faint: 'rgba(245,245,247,0.44)',
        line: 'rgba(245,245,247,0.13)', line2: 'rgba(245,245,247,0.24)', fill: 'rgba(245,245,247,0.09)',
        accent: '#E8202C', accentDeep: IMPULSE_RED, accentInk: '#FFFFFF', accentSoft: hexA('#E8202C', 0.16),
        chipBg: 'rgba(245,245,247,0.09)', chipText: '#F5F5F7', chipOn: '#E8202C', chipOnInk: '#FFFFFF',
        mapBg: '#101011', mapLine: 'rgba(245,245,247,0.055)', mapBlock: 'rgba(245,245,247,0.035)',
        ph: '#141415', phLine: 'rgba(245,245,247,0.07)', phText: '#98989D',
        glassTint: 'rgba(46,46,48,0.45)', glassSolid: 'rgba(36,36,38,0.94)', glassEdge: 'rgba(255,255,255,0.16)',
        blurTint: 'dark',
        shadow: {},
        floatShadow: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
      }
    : {
        dark: false,
        bg: '#F1F1F4', bgRGB: '241,241,244', surface: '#FFFFFF', surface2: '#E7E7EC', sunken: '#F1F1F4',
        text: '#0A0A0A', muted: '#6A6A6F', faint: '#A1A1A6',
        line: 'rgba(10,10,10,0.10)', line2: 'rgba(10,10,10,0.17)', fill: 'rgba(10,10,10,0.06)',
        accent: IMPULSE_RED, accentDeep: '#A50611', accentInk: '#FFFFFF', accentSoft: hexA(IMPULSE_RED, 0.1),
        chipBg: 'rgba(10,10,10,0.06)', chipText: '#0A0A0A', chipOn: IMPULSE_RED, chipOnInk: '#FFFFFF',
        mapBg: '#E4E4EA', mapLine: 'rgba(10,10,10,0.07)', mapBlock: 'rgba(10,10,10,0.045)',
        ph: '#E4E4EA', phLine: 'rgba(10,10,10,0.055)', phText: '#6A6A6F',
        glassTint: 'rgba(255,255,255,0.55)', glassSolid: 'rgba(250,250,252,0.96)', glassEdge: 'rgba(255,255,255,0.75)',
        blurTint: 'light',
        shadow: {},
        floatShadow: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
      };
}

/** Appearance preference. 'system' follows the device's Light/Dark setting. */
export type Appearance = 'system' | 'light' | 'dark';

/**
 * Resolve an appearance preference against the OS scheme. When the OS doesn't
 * report one (some web browsers), fall back to the brand's dark ground.
 */
export function resolveDark(appearance: Appearance, system: string | null | undefined): boolean {
  if (appearance === 'system') return system !== 'light';
  return appearance === 'dark';
}

// ── profile ──────────────────────────────────────────────────
export type Profile = {
  name: string;
  email: string;
  phone: string;
  suburb: string;
  acts: string[];
  party: number;
  notifications: boolean;
};

// Empty until hydrated from the authenticated user (/users/me).
const DEFAULT_PROFILE: Profile = {
  name: '',
  email: '',
  phone: '',
  suburb: '',
  acts: [],
  party: 2,
  notifications: false,
};

// ── app-wide state ───────────────────────────────────────────
type AppState = {
  T: Theme;
  dark: boolean;
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
  accent: string;
  /** True once a Supabase session exists. Guests can browse; some actions ask them to sign in. */
  signedIn: boolean;
  filters: Filters;
  setFilters: (f: Filters) => void;
  // Live deal feed (Drop shape for filter/map compat)
  drops: Drop[];
  // Raw API deals (keyed by id for O(1) lookup in detail screens)
  apiDeals: Record<string, ApiDeal>;
  dealsLoading: boolean;
  refreshDeals: () => Promise<void>;
  // Bookings / plans
  plans: Plan[];
  addPlan: (p: Plan) => void;
  bookingsLoading: boolean;
  refreshBookings: () => Promise<void>;
  profile: Profile;
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  // Huddle voting: when active, the home feed becomes the ballot — the user
  // picks their top 3 from the normal deal cards. candidateIds limits picks to
  // deals that fit the group.
  voteSession: VoteSession | null;
  voteRanking: string[];            // deal ids, best first (max 3)
  startVoting: (s: VoteSession) => void;
  toggleVotePick: (dealId: string) => void;
  clearVoting: () => void;
  // The user's current huddle (created / joined / voted), so the home bar can
  // show its live status instead of the "Start a Huddle" prompt.
  activeHuddle: ActiveHuddle | null;
  setActiveHuddle: (h: ActiveHuddle | null) => void;
  reset: () => void;
};

export type VoteSession = {
  huddleId: string;
  memberToken?: string;
  candidateIds: string[];
};

export type ActiveHuddle = {
  huddleId: string;
  memberToken?: string;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('system');
  const [signedIn, setSignedIn] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [rawDeals, setRawDeals] = useState<ApiDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [voteSession, setVoteSession] = useState<VoteSession | null>(null);
  const [voteRanking, setVoteRanking] = useState<string[]>([]);
  const [activeHuddle, setActiveHuddleState] = useState<ActiveHuddle | null>(null);

  // Persisted preferences: the active huddle (survives reloads/restarts) and
  // the appearance override. Loaded once on mount; saved on every change.
  useEffect(() => {
    persistGet(ACTIVE_HUDDLE_KEY).then((raw) => {
      if (!raw) return;
      try { setActiveHuddleState(JSON.parse(raw)); } catch { /* ignore corrupt value */ }
    });
    persistGet(APPEARANCE_KEY).then((raw) => {
      if (raw === 'light' || raw === 'dark' || raw === 'system') setAppearanceState(raw);
    });
  }, []);

  const setActiveHuddle = (h: ActiveHuddle | null) => {
    setActiveHuddleState(h);
    if (h) persistSet(ACTIVE_HUDDLE_KEY, JSON.stringify(h));
    else persistDel(ACTIVE_HUDDLE_KEY);
  };

  const setAppearance = (a: Appearance) => {
    setAppearanceState(a);
    persistSet(APPEARANCE_KEY, a);
  };

  const dark = resolveDark(appearance, system);
  const T = useMemo(() => tokens(dark), [dark]);

  // Convert raw API deals → Drop array whenever deals change
  const drops: Drop[] = useMemo(() => rawDeals.map((d) => apiDealToDrop(d)), [rawDeals]);

  // O(1) lookup map for detail screens
  const apiDeals: Record<string, ApiDeal> = useMemo(
    () => Object.fromEntries(rawDeals.map((d) => [d.id, d])),
    [rawDeals],
  );

  const refreshDeals = async () => {
    setDealsLoading(true);
    try {
      const data = await listDeals();
      setRawDeals(data);
    } catch {
      // Keep stale data on error; screens handle empty state
    } finally {
      setDealsLoading(false);
    }
  };

  const refreshBookings = async () => {
    setBookingsLoading(true);
    try {
      const data = await getMyBookings();
      // Hide unpaid holds (abandoned checkouts) — they have no code yet.
      setPlans(data.filter((b) => b.status !== 'pending').map(apiBookingToPlan));
    } catch {
      // Not authenticated yet or network error — keep existing plans
    } finally {
      setBookingsLoading(false);
    }
  };

  // Hydrate the profile from the signed-in user (/users/me), with the
  // Supabase session's email as a fallback if the backend row doesn't exist yet.
  const refreshProfile = async () => {
    setProfileLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProfile(DEFAULT_PROFILE);
        return;
      }
      // OAuth providers (Google, Apple) return the user's real name in the
      // session's user_metadata — capture it so the account has a name, not
      // just an email. Order: backend row → provider name → email username.
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const providerName =
        (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta.name === 'string' && meta.name.trim()) ||
        '';

      let up: Awaited<ReturnType<typeof fetchUserProfile>>;
      try {
        up = await fetchUserProfile(); // null if the row doesn't exist yet
      } catch {
        // Backend unreachable: still show who's signed in from the session,
        // but keep the preferences we already have rather than blanking them.
        const sessionEmail = user.email ?? '';
        setProfile((p) => ({
          ...p,
          name: p.name || providerName || (sessionEmail ? sessionEmail.split('@')[0] : ''),
          email: p.email || sessionEmail,
          phone: p.phone || user.phone || '',
        }));
        return;
      }
      const email = up?.email ?? user.email ?? '';
      const backendName = up?.full_name?.trim() ?? '';
      const name = (backendName || providerName || (email ? email.split('@')[0] : '')) || 'You';
      setProfile({
        name,
        email,
        phone: up?.phone ?? user.phone ?? '',
        suburb: up?.home_suburb ?? '',
        acts: up?.preferred_acts ?? [],
        party: up?.party_size ?? 2,
        notifications: up?.notifications_enabled ?? false,
      });

      // Persist the provider's name to the backend once, so server-side
      // consumers (e.g. the huddle creator's display name) get it too.
      if (!backendName && providerName) {
        syncUserProfile({ full_name: providerName }).catch(() => {});
      }
    } catch {
      // Keep whatever profile we already have on error
    } finally {
      setProfileLoading(false);
    }
  };

  // Deals are public — load immediately on mount regardless of auth.
  // Bookings require a session — load/clear on auth state changes.
  useEffect(() => {
    refreshDeals();

    // Live booking updates: when the venue verifies the customer's code, the
    // backend updates the bookings row (status → attended, balance charged,
    // payment_note set). Supabase Realtime pushes that change here so the
    // customer's screen flips to "verified/charged" without a manual refresh.
    // RLS ("bookings: user read own") scopes delivery to the signed-in user.
    let bookingsChannel: RealtimeChannel | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSignedIn(!!session);
      if (session) {
        refreshDeals();
        refreshBookings();
        refreshProfile();
        // Refresh the push token for already-opted-in users (huddle pushes).
        import('./permissions').then((p) => p.syncPushToken().catch(() => {}));
        if (!bookingsChannel) {
          bookingsChannel = supabase
            .channel('bookings-live')
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'bookings',
                filter: `user_id=eq.${session.user.id}`,
              },
              () => { refreshBookings(); },
            )
            .subscribe();
        }
      } else {
        bookingsChannel?.unsubscribe();
        bookingsChannel = null;
        setPlans([]);
        setProfile(DEFAULT_PROFILE);
      }
    });

    return () => {
      bookingsChannel?.unsubscribe();
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AppState = {
    T, dark, appearance, setAppearance, accent: T.accent,
    signedIn,
    filters, setFilters,
    drops, apiDeals, dealsLoading, refreshDeals,
    plans,
    addPlan: (p) => setPlans((prev) => [p, ...prev]),
    bookingsLoading, refreshBookings,
    profile, setProfile, profileLoading, refreshProfile,
    voteSession, voteRanking,
    startVoting: (s) => { setVoteSession(s); setVoteRanking([]); },
    toggleVotePick: (dealId) =>
      setVoteRanking((prev) => {
        if (prev.includes(dealId)) return prev.filter((x) => x !== dealId);
        if (prev.length >= 3) return prev;   // top 3 only
        return [...prev, dealId];
      }),
    clearVoting: () => { setVoteSession(null); setVoteRanking([]); },
    activeHuddle, setActiveHuddle,
    reset: () => {
      setFilters(DEFAULT_FILTERS);
      setPlans([]);
      setProfile(DEFAULT_PROFILE);
      setVoteSession(null);
      setVoteRanking([]);
      setActiveHuddle(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}

export function useTheme(): Theme {
  return useApp().T;
}
