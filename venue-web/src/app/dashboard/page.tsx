"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { bookingApi, venueApi, type Booking, type Deal, type DealPerformanceItem, type StatsResponse } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { useAuth } from "@/providers/AuthProvider";
import { formatCurrency } from "@/lib/utils";
import { FONT_DISPLAY, FONT_MONO, card, btnPrimary, btnGhost, eyebrow } from "@/lib/ui";

export default function DashboardPage() {
  const { venue, venues, loading, error, refetch } = useVenue();
  const router = useRouter();

  // Onboarding is only correct when they genuinely own nothing. If the load
  // failed we show the error instead — bouncing to onboarding on a 401 is how
  // an auth problem used to masquerade as "you have no venue".
  useEffect(() => {
    if (!loading && !error && venues.length === 0) router.replace("/dashboard/onboarding");
  }, [loading, error, venues.length, router]);

  if (error) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "60vh", padding: 24 }}>
        <div style={{ ...card, borderRadius: 16, padding: 32, maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, marginBottom: 10 }}>Couldn&apos;t load your venues</div>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "0 0 20px" }}>{error}</p>
          <button onClick={refetch} style={{ ...btnPrimary, padding: "11px 20px", borderRadius: 11 }}>Try again</button>
        </div>
      </div>
    );
  }

  if (loading || !venue) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }

  return <DashboardContent venueId={venue.id} venueName={venue.name} />;
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

// ── Deal performance formatting ──────────────────────────────────────────────
// Deals store display strings, not timestamps: date "Monday 3 June 2026",
// slots ["10:00 AM", "1:00 PM"]. Anything that doesn't match falls through
// to the raw text rather than rendering a wrong window.

const SLOT_RE = /^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]$/;

function slotMinutes(slot: string): number {
  const m = SLOT_RE.exec(slot.trim());
  if (!m) return 0;
  const h = Number(m[1]) % 12;
  return (m[3].toLowerCase() === "p" ? h + 12 : h) * 60 + Number(m[2]);
}

/** "1:00 PM" → "1pm"; "10:30 AM" → "10:30am". */
function slotLabel(slot: string): string {
  const m = SLOT_RE.exec(slot.trim());
  if (!m) return slot;
  const suffix = m[3].toLowerCase() === "p" ? "pm" : "am";
  return m[2] === "00" ? `${Number(m[1])}${suffix}` : `${Number(m[1])}:${m[2]}${suffix}`;
}

/** ("Monday 3 June 2026", ["10:00 AM", "1:00 PM"]) → "Mon 10am — 1pm". */
function timeWindow(date: string, slots: string[]): string {
  const day = /^[A-Za-z]+day\b/.test(date) ? date.slice(0, 3) : "";
  if (slots.length === 0) return day || date;

  const sorted = [...slots].sort((a, b) => slotMinutes(a) - slotMinutes(b));
  const first = slotLabel(sorted[0]);
  const last = slotLabel(sorted[sorted.length - 1]);
  const window = first === last ? first : `${first} — ${last}`;
  return day ? `${day} ${window}` : window;
}

function formatDuration(mins: number): string {
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem ? `${hours}h ${rem}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem ? `${days}d ${rem}h` : `${days}d`;
}

/** 25.00 → "25", 12.50 → "12.5". */
function trimPct(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

  const { data: performance = [], isLoading: perfLoading } = useQuery<DealPerformanceItem[]>({
    queryKey: ["deal-performance", venueId],
    queryFn: () => venueApi.dealPerformance(venueId, 10),
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

      {/* Deal performance */}
      <div style={{ marginTop: 34 }}>
        <div style={{ ...eyebrow, marginBottom: 8 }}>Deal insights — helping you find your best window</div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, letterSpacing: "-.02em", margin: "0 0 18px" }}>
          Deal performance
        </h2>

        {perfLoading ? (
          <div className="dash-perf-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {[...Array(2)].map((_, i) => (
              <div key={i} style={{ ...card, borderRadius: 16, height: 172, animation: "pm-glow 1.4s ease-in-out infinite" }} />
            ))}
          </div>
        ) : performance.length === 0 ? (
          <div style={{ ...card, borderRadius: 16, padding: 40, textAlign: "center", color: "var(--faint)", fontSize: 14 }}>
            No completed deals yet — insights appear once a deal has run.
          </div>
        ) : (
          <div className="dash-perf-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {performance.map((p) => (
              <DealPerformanceCard key={p.deal_id} deal={p} />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 1000px) {
          .dash-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-two-col { grid-template-columns: 1fr !important; }
          .dash-perf-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const metricLabel = {
  fontFamily: FONT_MONO,
  fontSize: 10,
  letterSpacing: ".1em",
  textTransform: "uppercase" as const,
  color: "var(--faint)",
  marginBottom: 7,
};

function DealPerformanceCard({ deal }: { deal: DealPerformanceItem }) {
  const pct = Math.round(deal.fill_rate);
  const barColor = pct >= 80 ? "var(--good)" : pct >= 40 ? "var(--accent)" : "var(--muted)";

  return (
    <div style={{ ...card, borderRadius: 16, padding: 20 }}>
      {/* Deal + when it ran */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {deal.title}
          </div>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)", background: "var(--accent-soft)", padding: "3px 8px", borderRadius: 6 }}>
            {deal.category}
          </span>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, letterSpacing: "-.01em" }}>
            {trimPct(deal.discount_pct)}% off
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 5, whiteSpace: "nowrap" }}>
            {timeWindow(deal.date, deal.slots)}
          </div>
        </div>
      </div>

      {/* Numbers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: 14, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <div>
          <div style={metricLabel}>Spots filled</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19, lineHeight: 1 }}>
            {deal.spots_filled}
            <span style={{ color: "var(--faint)" }}> / {deal.total_spots}</span>
          </div>
        </div>
        <div>
          <div style={metricLabel}>Fill rate</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19, lineHeight: 1 }}>{pct}%</div>
        </div>
        <div>
          <div style={metricLabel}>Live → last booking</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19, lineHeight: 1, color: deal.minutes_to_last_booking === null ? "var(--faint)" : undefined }}>
            {deal.minutes_to_last_booking === null ? "—" : formatDuration(deal.minutes_to_last_booking)}
          </div>
        </div>
      </div>

      {/* Fill bar */}
      <div style={{ height: 5, borderRadius: 5, background: "var(--sunken)", overflow: "hidden", marginTop: 16 }}>
        <span style={{ display: "block", height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`, background: barColor }} />
      </div>
    </div>
  );
}
