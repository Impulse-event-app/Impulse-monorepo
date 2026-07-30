"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, venueApi, type Venue } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

interface VenueContextValue {
  /** The venue every dashboard screen is currently scoped to. */
  venue: Venue | null;
  /** All venues this owner has — drives the sidebar switcher. */
  venues: Venue[];
  loading: boolean;
  /** Non-404 failure (401 token/project mismatch, 500, network). When set, the
   *  user has NOT been confirmed venue-less — do not send them to onboarding. */
  error: ApiError | null;
  selectVenue: (id: string) => void;
  refetch: () => void;
  setVenue: (v: Venue) => void;
}

const VenueContext = createContext<VenueContextValue | null>(null);

// The chosen venue id, so a switch survives client navigation and reloads.
const VENUE_KEY = "impulse_venue_id";

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    return `Couldn't load your venues (${err.status}): ${err.message}`;
  }
  return "Couldn't reach the server to load your venues.";
}

export function VenueProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  // Venue created during onboarding, adopted before the query refetches.
  const [pending, setPending] = useState<Venue | null>(null);
  // Read once on mount rather than every render. This provider only mounts
  // client-side (RequireAuth gates it), so there's no hydration mismatch.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : sessionStorage.getItem(VENUE_KEY)
  );

  const {
    data,
    isPending,
    error: queryError,
    refetch: refetchQuery,
  } = useQuery<Venue[]>({
    queryKey: ["my-venues", session?.user?.id],
    queryFn: () => venueApi.mineAll(),
    enabled: !!session,
    // A 401 means the token is wrong, not that it's a bad moment — retrying
    // just delays a real error the user needs to see.
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

  const venues = data ?? (pending ? [pending] : []);

  // Honour the stored/selected venue only while it's still one of theirs —
  // otherwise fall back to the first, so a deleted venue can't wedge the app.
  const venue =
    venues.find((v) => v.id === selectedId) ?? venues[0] ?? null;

  const selectVenue = useCallback((id: string) => {
    sessionStorage.setItem(VENUE_KEY, id);
    setSelectedId(id);
  }, []);

  // Used by onboarding: adopt the just-created venue without a round trip.
  const setVenue = useCallback((v: Venue) => {
    sessionStorage.setItem(VENUE_KEY, v.id);
    setPending(v);
    setSelectedId(v.id);
  }, []);

  const refetch = useCallback(() => {
    refetchQuery();
  }, [refetchQuery]);

  return (
    <VenueContext.Provider
      value={{
        venue,
        venues,
        loading: !!session && isPending,
        error: queryError ? describe(queryError) : null,
        selectVenue,
        refetch,
        setVenue,
      }}
    >
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const ctx = useContext(VenueContext);
  if (!ctx) throw new Error("useVenue must be used within VenueProvider");
  return ctx;
}
