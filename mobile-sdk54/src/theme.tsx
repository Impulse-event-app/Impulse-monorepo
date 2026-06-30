// theme.tsx — Impulse: theme tokens, fonts, and the app-wide state provider.
// Ported from the Impulse design handoff (app-data.jsx / app-main.jsx).
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_FILTERS, Drop, Filters, Plan, apiBookingToPlan, apiDealToDrop } from './data';
import { ApiDeal, listDeals, getMyBookings } from './api';
import { supabase } from './supabase';

// ── fonts ────────────────────────────────────────────────────
// Each weight is its own family in React Native. These keys must match the
// names registered with useFonts() in app/_layout.tsx.
export const FONTS = {
  ui: {
    400: 'Archivo_400Regular',
    500: 'Archivo_500Medium',
    600: 'Archivo_600SemiBold',
    700: 'Archivo_700Bold',
  },
  display: {
    400: 'SpaceGrotesk_400Regular',
    500: 'SpaceGrotesk_500Medium',
    600: 'SpaceGrotesk_600SemiBold',
    700: 'SpaceGrotesk_700Bold',
  },
  mono: {
    400: 'SpaceMono_400Regular',
    700: 'SpaceMono_700Bold',
  },
} as const;

type UIWeight = 400 | 500 | 600 | 700;
type MonoWeight = 400 | 700;
export const fontUI = (w: UIWeight = 400) => FONTS.ui[w];
export const fontDisplay = (w: UIWeight = 600) => FONTS.display[w];
export const fontMono = (w: MonoWeight = 400) => FONTS.mono[w];

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
  surface: string;
  surface2: string;
  sunken: string;
  text: string;
  muted: string;
  faint: string;
  line: string;
  line2: string;
  accent: string;
  accentInk: string;
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
  shadow: object;
};

// RN shadow approximation of the design's box-shadows.
const SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.4,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
};
const SHADOW_LIGHT = {
  shadowColor: '#281e14',
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4,
};

export function tokens(dark: boolean, accent = '#FF5A4D'): Theme {
  return dark
    ? {
        dark: true,
        bg: '#0F0E0D', surface: '#1A1817', surface2: '#232120', sunken: '#0A0908',
        text: '#F4F1EA', muted: 'rgba(244,241,234,0.60)', faint: 'rgba(244,241,234,0.38)',
        line: 'rgba(244,241,234,0.10)', line2: 'rgba(244,241,234,0.16)',
        accent, accentInk: '#1A0B08', accentSoft: hexA(accent, 0.17),
        chipBg: 'rgba(244,241,234,0.07)', chipText: 'rgba(244,241,234,0.60)',
        chipOn: '#F4F1EA', chipOnInk: '#0F0E0D',
        mapBg: '#15110F', mapLine: 'rgba(244,241,234,0.055)', mapBlock: 'rgba(244,241,234,0.03)',
        ph: '#211E1C', phLine: 'rgba(244,241,234,0.05)', phText: 'rgba(244,241,234,0.34)',
        shadow: SHADOW,
      }
    : {
        dark: false,
        bg: '#F6F3ED', surface: '#FFFFFF', surface2: '#F0ECE4', sunken: '#EEEAE2',
        text: '#17120F', muted: 'rgba(23,18,15,0.60)', faint: 'rgba(23,18,15,0.42)',
        line: 'rgba(23,18,15,0.10)', line2: 'rgba(23,18,15,0.16)',
        accent, accentInk: '#1A0B08', accentSoft: hexA(accent, 0.13),
        chipBg: 'rgba(23,18,15,0.05)', chipText: 'rgba(23,18,15,0.60)',
        chipOn: '#17120F', chipOnInk: '#F6F3ED',
        mapBg: '#E9E3D8', mapLine: 'rgba(23,18,15,0.06)', mapBlock: 'rgba(23,18,15,0.035)',
        ph: '#EAE5DC', phLine: 'rgba(23,18,15,0.05)', phText: 'rgba(23,18,15,0.34)',
        shadow: SHADOW_LIGHT,
      };
}

// ── profile ──────────────────────────────────────────────────
export type Profile = {
  name: string;
  phone: string;
  suburb: string;
  acts: string[];
  party: number;
};

const DEFAULT_PROFILE: Profile = {
  name: 'Jordan Lee',
  phone: '+61 4XX XXX 891',
  suburb: 'Surry Hills',
  acts: ['Bowling', 'Karaoke', 'Live music'],
  party: 2,
};

// ── app-wide state ───────────────────────────────────────────
type AppState = {
  T: Theme;
  dark: boolean;
  setDark: (v: boolean) => void;
  accent: string;
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
  reset: () => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(true);
  const [accent] = useState('#FF5A4D');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [rawDeals, setRawDeals] = useState<ApiDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const T = useMemo(() => tokens(dark, accent), [dark, accent]);

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
      setPlans(data.map(apiBookingToPlan));
    } catch {
      // Not authenticated yet or network error — keep existing plans
    } finally {
      setBookingsLoading(false);
    }
  };

  // Load deals when the user has a session; reload bookings on auth change
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        refreshDeals();
        refreshBookings();
      } else {
        setRawDeals([]);
        setPlans([]);
      }
    });

    // Also try loading immediately in case there's already a session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        refreshDeals();
        refreshBookings();
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AppState = {
    T, dark, setDark, accent,
    filters, setFilters,
    drops, apiDeals, dealsLoading, refreshDeals,
    plans,
    addPlan: (p) => setPlans((prev) => [p, ...prev]),
    bookingsLoading, refreshBookings,
    profile, setProfile,
    reset: () => {
      setFilters(DEFAULT_FILTERS);
      setPlans([]);
      setProfile(DEFAULT_PROFILE);
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
