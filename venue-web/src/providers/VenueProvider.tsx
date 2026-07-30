"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ApiError, venueApi, type Venue } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

interface VenueContextValue {
  venue: Venue | null;
  loading: boolean;
  /** Non-404 failure (401 token/project mismatch, 500, network). When set, the
   *  user has NOT been confirmed venue-less — do not send them to onboarding. */
  error: ApiError | null;
  refetch: () => void;
  setVenue: (v: Venue) => void;
}

const VenueContext = createContext<VenueContextValue | null>(null);

// We store the chosen venue id in sessionStorage so it survives client navigation.
const VENUE_KEY = "impulse_venue_id";

export function VenueProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [venue, setVenueState] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!session) {
      setVenueState(null);
      setLoading(false);
      return;
    }
    try {
      const stored = sessionStorage.getItem(VENUE_KEY);
      let v: Venue | null = null;

      if (stored) {
        try {
          v = await venueApi.get(stored);
        } catch (e) {
          // A stale/foreign stored id (e.g. left over from the old project) 404s —
          // drop it and fall through to /venues/mine. Any other failure must
          // propagate so we don't misread it as "no venue".
          if (e instanceof ApiError && e.status === 404) {
            sessionStorage.removeItem(VENUE_KEY);
          } else {
            throw e;
          }
        }
      }

      if (!v) v = await venueApi.mine(); // 404 here = genuinely no venue yet

      sessionStorage.setItem(VENUE_KEY, v.id);
      setVenueState(v);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Genuinely no venue → onboarding is correct.
        sessionStorage.removeItem(VENUE_KEY);
        setVenueState(null);
      } else {
        // Backend down / token rejected / offline. Keep the user out of the
        // create-venue flow — surface the error so the UI can retry instead.
        setVenueState(null);
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, err instanceof Error ? err.message : "Network error")
        );
      }
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const setVenue = useCallback((v: Venue) => {
    sessionStorage.setItem(VENUE_KEY, v.id);
    setVenueState(v);
    setError(null);
  }, []);

  const refetch = useCallback(() => {
    load();
  }, [load]);

  return (
    <VenueContext.Provider value={{ venue, loading, error, refetch, setVenue }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const ctx = useContext(VenueContext);
  if (!ctx) throw new Error("useVenue must be used within VenueProvider");
  return ctx;
}
