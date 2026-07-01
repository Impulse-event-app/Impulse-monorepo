"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { venueApi, type Venue } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

interface VenueContextValue {
  venue: Venue | null;
  loading: boolean;
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

  const fetchVenue = useCallback(
    async (id: string) => {
      try {
        const v = await venueApi.get(id);
        setVenueState(v);
      } catch {
        // stored id is stale, clear it
        sessionStorage.removeItem(VENUE_KEY);
        setVenueState(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    const stored = sessionStorage.getItem(VENUE_KEY);
    if (stored) {
      fetchVenue(stored);
    } else {
      setLoading(false);
    }
  }, [session, fetchVenue]);

  const setVenue = useCallback((v: Venue) => {
    sessionStorage.setItem(VENUE_KEY, v.id);
    setVenueState(v);
  }, []);

  const refetch = useCallback(() => {
    if (venue) fetchVenue(venue.id);
  }, [venue, fetchVenue]);

  return (
    <VenueContext.Provider value={{ venue, loading, refetch, setVenue }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const ctx = useContext(VenueContext);
  if (!ctx) throw new Error("useVenue must be used within VenueProvider");
  return ctx;
}
