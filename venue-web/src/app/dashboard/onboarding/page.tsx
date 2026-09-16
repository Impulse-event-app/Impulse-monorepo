"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { venueApi, type VenueCreate } from "@/lib/api";
import { VenueForm } from "@/components/VenueForm";
import { useVenue } from "@/providers/VenueProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { FONT_DISPLAY, FONT_MONO, card, btnPrimary } from "@/lib/ui";

export default function VenueOnboardingPage() {
  const { venue, loading, error: venueLoadError, refetch, setVenue } = useVenue();
  const router = useRouter();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    if (!loading && venue) router.replace("/dashboard");
  }, [loading, venue, router]);

  if (!loading && venue) return null;

  // If the venue lookup failed (backend down / token rejected) we can't be sure
  // the user is venue-less — block the create form so we don't spawn a duplicate.
  if (venueLoadError) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", padding: 24 }}>
        <div style={{ ...card, borderRadius: 18, padding: 32, maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
            Can&apos;t confirm your venue
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
            We couldn&apos;t reach the server to check whether you already have a venue. To avoid
            creating a duplicate, we&apos;ve paused setup — retry once you&apos;re back online.
            <span style={{ display: "block", marginTop: 8, fontFamily: FONT_MONO, fontSize: 11, color: "var(--faint)" }}>
              {venueLoadError.status ? `Error ${venueLoadError.status}` : "Network error"} · {venueLoadError.message}
            </span>
          </p>
          <button onClick={refetch} style={{ ...btnPrimary, padding: "12px 22px" }}>Try again</button>
        </div>
      </div>
    );
  }

  async function handleSubmit(payload: VenueCreate) {
    const created = await venueApi.create(payload);
    setVenue(created);
    // Straight into Pinch verification rather than the dashboard. It reads as
    // part of signing up this way; left as a dashboard banner it is the kind of
    // thing a venue never gets round to, and until it is done their takings
    // cannot settle to their own account.
    router.replace("/dashboard/payments-setup");
  }

  if (loading) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }

  return (
    <>
      {/* Theme toggle */}
      <button
        onClick={toggle}
        style={{ position: "fixed", top: 18, right: 18, zIndex: 20, display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 13px", borderRadius: 999, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }} />
        {theme === "dark" ? "Dark" : "Light"}
      </button>

      <div style={{ maxWidth: 840, margin: "0 auto", padding: "44px 32px 80px" }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 12 }}>Step 1 of 2 · Set up your venue</div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 38, letterSpacing: "-.02em", margin: "0 0 8px" }}>Tell us about your venue</h1>
        <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 10px", maxWidth: 560 }}>This is what guests see when your deals surface. You can edit any of it later from Venue details. Next you&rsquo;ll set up payments so your takings reach your own account.</p>
        <VenueForm submitLabel="Create venue →" savingLabel="Creating venue…" onSubmit={handleSubmit} />
      </div>
    </>
  );
}
