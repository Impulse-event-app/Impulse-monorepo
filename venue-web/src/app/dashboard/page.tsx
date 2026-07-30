"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { bookingApi, venueApi, type ApiError, type Booking, type Deal, type StatsResponse } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency } from "@/lib/utils";
import { FONT_DISPLAY, FONT_MONO, card, btnPrimary, btnGhost } from "@/lib/ui";

export default function DashboardPage() {
  const { venue, loading, error, refetch } = useVenue();
  const router = useRouter();

  // Only send to onboarding once we've CONFIRMED there's no venue (a 404).
  // A backend error (down API / rejected token) must not masquerade as
  // "no venue" — that wrongly dumps an existing owner on create-venue.
  useEffect(() => {
    if (!loading && !venue && !error) {
      router.replace("/dashboard/onboarding");
    }
  }, [loading, venue, error, router]);

  if (error) {
    return <VenueLoadError error={error} onRetry={refetch} />;
  }

  if (loading || !venue) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }

  return <DashboardContent venueId={venue.id} venueName={venue.name} />;
}

function VenueLoadError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const auth = error.status === 401 || error.status === 403;
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", padding: 24 }}>
      <div style={{ ...card, borderRadius: 18, padding: 32, maxWidth: 460, textAlign: "center" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
          Couldn&apos;t load your venue
        </div>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
          {auth
            ? "Your session couldn't be verified. Sign out and back in, then try again."
            : "We couldn't reach the server. This is a connection issue, not a missing venue — your venue is safe."}
          <span style={{ display: "block", marginTop: 8, fontFamily: FONT_MONO, fontSize: 11, color: "var(--faint)" }}>
            {error.status ? `Error ${error.status}` : "Network error"} · {error.message}
          </span>
        </p>
        <button onClick={onRetry} style={{ ...btnPrimary, padding: "12px 22px" }}>Try again</button>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" }).replace(",", " ·");
}

function DashboardContent({ venueId, venueName }: { venueId: string; venueName: string }) {
  const router = useRouter();
  const { user } = useAuth();

  const firstName =
    user?.email?.split("@")[0]?.split(/[.\-_]/)[0]?.replace(/^\w/, (c) => c.toUpperCase()) ?? venueName;

  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ["stats", venueId],
    queryFn: () => venueApi.stats(venueId),
    refetchInterval: 60_000,
  });

  // Aggregate recent bookings across the venue's deals for the "tonight" feed.
  const { data: recent = [] } = useQuery<Array<Booking & { dealTitle: string }>>({
    queryKey: ["recent-bookings", venueId],
    queryFn: async () => {
      const deals = await venueApi.deals(venueId);
      const titleFor = new Map(deals.map((d: Deal) => [d.id, d.title]));
      const lists = await Promise.all(
        deals.map((d) => bookingApi.listForDeal(d.id).catch(() => [] as Booking[]))
      );
      return lists
        .flat()
        .map((b) => ({ ...b, dealTitle: titleFor.get(b.deal_id) ?? "Deal" }))
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 4);
    },
    refetchInterval: 60_000,
  });

  const pctFilled =
    stats && stats.total_spots > 0 ? Math.round((stats.spots_filled / stats.total_spots) * 100) : 0;

  const statCards = stats
    ? [
        { label: "Bookings today", value: String(stats.bookings_today), sub: "Across all deals" },
        { label: "Revenue today", value: formatCurrency(stats.revenue_today), sub: "Confirmed today" },
        { label: "Spots filled", value: `${stats.spots_filled}/${stats.total_spots}`, sub: `${pctFilled}% of capacity` },
        { label: "Active deals", value: String(stats.active_deals), sub: "Live right now" },
      ]
    : [];

  return (
    <div style={{ padding: "38px 44px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 30, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>
            {todayLabel()}
          </div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 34, letterSpacing: "-.02em", margin: 0 }}>
            {greeting()}, {firstName}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => router.push("/dashboard/redeem")} style={{ ...btnGhost, padding: "12px 18px", borderRadius: 11 }}>
            Redeem ticket
          </button>
          <button onClick={() => router.push("/dashboard/deals/new")} style={{ ...btnPrimary, padding: "12px 18px", borderRadius: 11, boxShadow: "0 8px 22px var(--accent-soft)" }}>
            + New deal
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="dash-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        {isLoading || !stats
          ? [...Array(4)].map((_, i) => (
              <div key={i} style={{ ...card, borderRadius: 16, height: 128, animation: "pm-glow 1.4s ease-in-out infinite" }} />
            ))
          : statCards.map((st) => (
              <div key={st.label} style={{ ...card, borderRadius: 16, padding: 22, position: "relative", overflow: "hidden" }}>
                <span style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: "var(--accent)" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)" }}>{st.label}</span>
                </div>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-.02em", lineHeight: 1, whiteSpace: "nowrap" }}>{st.value}</div>
                <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>{st.sub}</div>
              </div>
            ))}
      </div>

      {/* Recent bookings + quick actions */}
      <div className="dash-two-col" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        <div style={{ ...card, borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17 }}>Recent bookings</div>
            <button onClick={() => router.push("/dashboard/bookings")} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              View all →
            </button>
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: "28px 0", textAlign: "center", color: "var(--faint)", fontSize: 14 }}>No bookings yet.</div>
          ) : (
            recent.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: "var(--accent)", width: 64 }}>{r.confirmation_code ?? "—"}</span>
                <span style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.dealTitle}</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{r.slot_time} · {r.num_people}p</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{formatCurrency(r.total_paid)}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", border: "1px solid var(--line2)", background: "linear-gradient(160deg, color-mix(in oklab, var(--accent) 14%, var(--surface)), var(--surface))" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Quick actions</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>Publish a deal or check in a guest.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={() => router.push("/dashboard/deals/new")} style={{ textAlign: "left", padding: 16, borderRadius: 12, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--text)", cursor: "pointer" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>+ New deal</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Fill empty tables tonight</div>
            </button>
            <button onClick={() => router.push("/dashboard/redeem")} style={{ textAlign: "left", padding: 16, borderRadius: 12, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--text)", cursor: "pointer" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Redeem ticket</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Enter a 6-digit code</div>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1000px) {
          .dash-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
