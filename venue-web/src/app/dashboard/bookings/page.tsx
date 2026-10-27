"use client";

import { Suspense, useEffect, useState, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { dealApi, venueApi, type Booking, type Deal, type VenueBookingsPage, type VenueBookingsQuery } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency } from "@/lib/utils";
import { FONT_DISPLAY, FONT_BODY, numeric, card, eyebrow, toneBadge, type Tone } from "@/lib/ui";

const COLS = ".8fr 1fr .9fr .9fr 1.6fr";
const VENUE_TZ = "Australia/Sydney";
const STATUS_TONE: Record<Booking["status"], Tone> = {
  voting: "neutral",
  collecting: "neutral",
  confirmed: "soft",
  redeemed: "solid",
  cancelled: "danger",
  expired: "neutral",
  collapsed: "neutral",
};

const STATUS_LABEL: Record<Booking["status"], string> = {
  voting: "voting",
  collecting: "filling",
  confirmed: "confirmed",
  redeemed: "redeemed",
  cancelled: "cancelled",
  expired: "expired",
  collapsed: "didn't go ahead",
};

// Bookings that will never walk in — kept visible but dimmed and sunk to the bottom.
const DEAD = new Set<Booking["status"]>(["cancelled", "expired", "collapsed"]);

type View = "upcoming" | "past";
type Sort = "newest" | "oldest";

const RANGES: Record<View, { value: string; label: string }[]> = {
  past: [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "month", label: "This month" },
    { value: "lastmonth", label: "Last month" },
    { value: "all", label: "All time" },
    { value: "custom", label: "Custom dates" },
  ],
  upcoming: [
    { value: "7d", label: "Next 7 days" },
    { value: "30d", label: "Next 30 days" },
    { value: "all", label: "All upcoming" },
    { value: "custom", label: "Custom dates" },
  ],
};
const DEFAULT_RANGE: Record<View, string> = { past: "30d", upcoming: "all" };

const STATUSES: Record<View, { value: string; label: string }[]> = {
  past: [
    { value: "all", label: "All statuses" },
    { value: "redeemed", label: "Redeemed" },
    { value: "confirmed", label: "Not redeemed" },
    { value: "dead", label: "Cancelled / didn't go ahead" },
    { value: "followup", label: "Needs follow-up" },
  ],
  upcoming: [
    { value: "all", label: "All statuses" },
    { value: "confirmed", label: "Confirmed" },
    { value: "pending", label: "Still filling" },
    { value: "dead", label: "Cancelled" },
    { value: "followup", label: "Needs follow-up" },
  ],
};

interface DealGroup {
  deal: Deal;
  bookings: Booking[];
}

interface Night {
  key: string;            // "2026-11-03", or "undated"
  label: string;
  deals: DealGroup[];
}

function todayInVenue() {
  // en-CA formats as YYYY-MM-DD, the same shape as deal_date.
  return new Date().toLocaleDateString("en-CA", { timeZone: VENUE_TZ });
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive deal_date bounds for a range preset; undefined means open-ended. */
function rangeBounds(view: View, range: string, today: string, from?: string, to?: string) {
  const monthStart = `${today.slice(0, 8)}01`;
  if (range === "custom") return { from, to };
  if (view === "upcoming") {
    if (range === "7d") return { from: today, to: addDays(today, 6) };
    if (range === "30d") return { from: today, to: addDays(today, 29) };
    return {};
  }
  if (range === "7d") return { from: addDays(today, -7), to: addDays(today, -1) };
  if (range === "30d") return { from: addDays(today, -30), to: addDays(today, -1) };
  if (range === "month") return { from: monthStart, to: addDays(today, -1) };
  if (range === "lastmonth") {
    const end = addDays(monthStart, -1);
    return { from: `${end.slice(0, 8)}01`, to: end };
  }
  return {};
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function nightLabel(iso: string, today: string) {
  const d = new Date(`${iso}T00:00`);
  const days = Math.round((d.getTime() - new Date(`${today}T00:00`).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** "7:30 PM" → minutes since midnight, so slots sort in time order. */
function slotMinutes(slot: string) {
  const m = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  let h = Number(m[1]) % 12;
  if (m[3]?.toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

function isUpcoming(d: Deal, today: string) {
  return d.deal_date ? d.deal_date >= today : d.is_active;
}

function groupByNight(rows: { booking: Booking; deal: Deal }[], sort: Sort, today: string): Night[] {
  const byDeal = new Map<string, DealGroup>();
  for (const { booking, deal } of rows) {
    const g = byDeal.get(deal.id) ?? { deal, bookings: [] };
    g.bookings.push(booking);
    byDeal.set(deal.id, g);
  }

  const nights = new Map<string, Night>();
  for (const g of byDeal.values()) {
    g.bookings.sort((a, b) =>
      Number(DEAD.has(a.status)) - Number(DEAD.has(b.status))
      || slotMinutes(a.slot_time) - slotMinutes(b.slot_time));
    const key = g.deal.deal_date ?? "undated";
    const n = nights.get(key) ?? { key, label: key === "undated" ? "No set date" : nightLabel(key, today), deals: [] };
    n.deals.push(g);
    nights.set(key, n);
  }

  // Undated deals always go last, whichever way the dates run.
  const dir = sort === "oldest" ? 1 : -1;
  return [...nights.values()].sort((a, b) =>
    a.key === "undated" ? 1 : b.key === "undated" ? -1 : dir * a.key.localeCompare(b.key));
}

function redeemedTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: VENUE_TZ });
}

const control: CSSProperties = {
  boxSizing: "border-box",
  height: 38,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid var(--line2)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: FONT_BODY,
};

/** A native select without the browser's arrow, so every control is the same
 *  height and the chevron sits inside the padding instead of on the border. */
function Select({ width, style, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { width: number; children: ReactNode }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0, ...style }}>
      <select {...props} style={{ ...control, width, paddingRight: 34, appearance: "none", WebkitAppearance: "none", cursor: props.disabled ? "default" : "pointer", opacity: props.disabled ? 0.5 : 1 }}>
        {children}
      </select>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ position: "absolute", right: 12, top: 13, pointerEvents: "none", color: "var(--muted)" }}>
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const pagerBtn = (disabled: boolean): CSSProperties => ({
  ...control,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.4 : 1,
});

export default function BookingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 44, color: "var(--faint)", fontSize: 14 }}>Loading…</div>}>
      <BookingsContent />
    </Suspense>
  );
}

function BookingsContent() {
  const { venue } = useVenue();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const today = todayInVenue();

  // Search once typing pauses, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setCode(query.replace(/\D/g, "")), 250);
    return () => clearTimeout(t);
  }, [query]);

  const dealFilter = params.get("deal_id");
  const { data: filteredDeal } = useQuery<Deal>({
    queryKey: ["deal", dealFilter],
    queryFn: () => dealApi.get(dealFilter!),
    enabled: !!dealFilter,
  });

  // Arriving from a deal's bookings link, open the tab that deal lives in.
  const view: View = (params.get("view") as View | null)
    ?? (filteredDeal && !isUpcoming(filteredDeal, today) ? "past" : "upcoming");
  const range = params.get("range") ?? (dealFilter ? "all" : DEFAULT_RANGE[view]);
  const customFrom = params.get("from") ?? undefined;
  const customTo = params.get("to") ?? undefined;
  const title = params.get("deal") ?? "";
  const status = params.get("status") ?? "all";
  const sort: Sort = (params.get("sort") as Sort | null) ?? (view === "past" ? "newest" : "oldest");
  const pageParam = Math.max(1, Number(params.get("page")) || 1);
  const searching = code.length > 0;
  const bounds = rangeBounds(view, range, today, customFrom, customTo);

  const request: VenueBookingsQuery = {
    view, sort, page: pageParam,
    date_from: bounds.from, date_to: bounds.to,
    deal: title || undefined,
    deal_id: dealFilter ?? undefined,
    status: status as VenueBookingsQuery["status"],
    q: code || undefined,
  };
  const { data, isLoading, isPlaceholderData } = useQuery<VenueBookingsPage>({
    queryKey: ["venue-bookings", venue?.id, request],
    queryFn: () => venueApi.bookings(venue!.id, request),
    // Wait for the deal so its tab is known before the first fetch.
    enabled: !!venue && (!dealFilter || !!filteredDeal),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  if (!venue) return null;

  /** Write filters to the URL so refresh and back keep them; any change but paging resets to page 1. */
  const set = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in updates)) next.delete("page");
    const qs = next.toString();
    // The native history API updates useSearchParams without a router round trip, so controls respond instantly.
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    if ("page" in updates) window.scrollTo({ top: 0 });
  };

  const dealsById = new Map((data?.deals ?? []).map((d) => [d.id, d]));
  const rows = (data?.bookings ?? []).flatMap((booking) => {
    const deal = dealsById.get(booking.deal_id);
    return deal ? [{ booking, deal }] : [];
  });
  const shown = groupByNight(rows, sort, today);
  const page = data?.page ?? 1;
  const pages = data?.pages ?? 1;
  const totals = data?.totals;
  const titles = data?.deal_titles ?? [];
  const filtersOn = !!title || status !== "all" || range !== (dealFilter ? "all" : DEFAULT_RANGE[view]);

  const dated = shown.filter((n) => n.key !== "undated").map((n) => n.key).sort();
  const pageSpan = dated.length
    ? dated[0] === dated[dated.length - 1] ? shortDate(dated[0]) : `${shortDate(dated[0])} – ${shortDate(dated[dated.length - 1])}`
    : null;

  const tab = (v: View) => (
    <button
      onClick={() => v !== view && set({ view: v, range: null, from: null, to: null, deal: null, status: null, sort: null })}
      aria-pressed={v === view}
      style={{
        position: "relative", padding: "8px 0", borderRadius: 9, border: "none", background: "transparent", cursor: "pointer",
        fontSize: 13, fontWeight: 600, color: v === view ? "var(--text)" : "var(--muted)", transition: "color .2s ease",
      }}
    >
      {v === "upcoming" ? "Upcoming" : "Past"}
    </button>
  );

  const stats = [
    { label: "Bookings", value: String(totals?.bookings ?? 0) },
    { label: "Guests", value: String(totals?.guests ?? 0) },
    { label: "Revenue", value: formatCurrency(totals?.revenue ?? 0) },
    ...(view === "past" && !searching && status === "all" && totals
      ? [{ label: "Redeemed", value: totals.redeemable ? `${Math.round((totals.redeemed / totals.redeemable) * 100)}%` : "—" }]
      : []),
  ];

  return (
    <div style={{ padding: "38px 44px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 32, letterSpacing: "-.02em", margin: 0 }}>Bookings</h1>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "96px 96px", padding: 3, borderRadius: 12, background: "var(--sunken)", border: "1px solid var(--line)" }}>
          {/* One pill that slides under whichever tab is on. */}
          <span
            aria-hidden
            style={{
              position: "absolute", top: 3, bottom: 3, left: 3, width: 96, borderRadius: 9,
              background: "var(--surface2)", boxShadow: "0 1px 3px rgba(0,0,0,.18)",
              transform: `translateX(${view === "past" ? 96 : 0}px)`,
              transition: "transform .32s cubic-bezier(.3,.7,.2,1)",
            }}
          />
          {tab("upcoming")}
          {tab("past")}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a code"
          inputMode="numeric"
          style={{ ...control, width: 130, flexShrink: 0, ...numeric, letterSpacing: ".05em" }}
        />
        <Select width={150} value={range} onChange={(e) => set({ range: e.target.value, ...(e.target.value === "custom" ? {} : { from: null, to: null }) })} disabled={searching}>
          {RANGES[view].map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
        {range === "custom" && (
          <>
            <input type="date" value={customFrom ?? ""} onChange={(e) => set({ from: e.target.value })} style={control} disabled={searching} aria-label="From" />
            <span style={{ color: "var(--faint)", fontSize: 13 }}>to</span>
            <input type="date" value={customTo ?? ""} onChange={(e) => set({ to: e.target.value })} style={control} disabled={searching} aria-label="To" />
          </>
        )}
        {!dealFilter && (
          <Select width={190} value={title} onChange={(e) => set({ deal: e.target.value })} disabled={searching}>
            <option value="">All deals</option>
            {titles.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}
        <Select width={215} value={status} onChange={(e) => set({ status: e.target.value === "all" ? null : e.target.value })} disabled={searching}>
          {STATUSES[view].map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select width={140} value={sort} onChange={(e) => set({ sort: e.target.value })} style={{ marginLeft: "auto" }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>

      {(dealFilter || searching) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, fontSize: 13, color: "var(--muted)" }}>
          {searching ? (
            <>Searching every booking for <strong style={{ color: "var(--text)", ...numeric }}>{code}</strong>
              <button onClick={() => setQuery("")} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Clear</button></>
          ) : (
            <>Showing only <strong style={{ color: "var(--text)" }}>{filteredDeal?.title ?? "one deal"}</strong>
              <Link href="/dashboard/bookings" style={{ color: "var(--accent)", fontWeight: 600 }}>Show all</Link></>
          )}
        </div>
      )}

      {/* Totals for whatever is filtered — cancelled bookings don't count. */}
      {totals && rows.length > 0 && (
        <div style={{ ...card, borderRadius: 14, display: "flex", flexWrap: "wrap", marginBottom: 20, overflow: "hidden" }}>
          {stats.map((s, i) => (
            <div key={s.label} style={{ flex: "1 1 120px", padding: "14px 20px", borderLeft: i ? "1px solid var(--line)" : "none" }}>
              <div style={{ ...eyebrow, fontSize: 10, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {!!totals?.followups && (
        <div style={{ ...card, borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13.5, display: "flex", alignItems: "center", gap: 10, borderColor: "var(--bad)" }}>
          <span style={toneBadge("danger").badge}>Follow up</span>
          {totals.followups === 1 ? "1 booking has" : `${totals.followups} bookings have`} a declined card — collect at the till.
          {status !== "followup" && !searching && (
            <button onClick={() => set({ status: "followup" })} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--accent)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Show them</button>
          )}
        </div>
      )}

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ ...card, borderRadius: 14, height: 56, animation: "pm-glow 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div style={{ ...card, borderRadius: 16, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {searching ? "No booking with that code."
              : filtersOn ? "No bookings match these filters."
              : view === "upcoming" ? "No upcoming bookings." : "No past bookings."}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 34, opacity: isPlaceholderData ? 0.55 : 1, transition: "opacity .15s ease" }}>
            {shown.map((night) => (
              <section key={night.key}>
                <h2 style={{ ...eyebrow, margin: "0 0 12px", color: night.label === "Today" ? "var(--accent)" : "var(--faint)" }}>
                  {night.label}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {night.deals.map((g) => <DealBookings key={g.deal.id} group={g} past={view === "past"} />)}
                </div>
              </section>
            ))}
          </div>

          {pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 28 }}>
              <button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} style={pagerBtn(page <= 1)}>← {sort === "newest" ? "Newer" : "Earlier"}</button>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                {pageSpan && <strong style={{ color: "var(--text)", fontWeight: 600 }}>{pageSpan}</strong>}
                {pageSpan && " · "}Page {page} of {pages}
              </span>
              <button disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} style={pagerBtn(page >= pages)}>{sort === "newest" ? "Older" : "Later"} →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DealBookings({ group: { deal, bookings }, past }: { group: DealGroup; past: boolean }) {
  const live = bookings.filter((b) => !DEAD.has(b.status));
  const guests = live.reduce((n, b) => n + b.num_people, 0);
  const paid = live.reduce((n, b) => n + b.total_paid, 0);

  return (
    <div style={{ ...card, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "16px 22px", background: "var(--surface2)" }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>
          {deal.title}
          {deal.schedule_id && (
            <span style={{ ...numeric, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", background: "var(--chip-bg)", padding: "3px 8px", borderRadius: 6, marginLeft: 8, verticalAlign: 2 }}>Weekly</span>
          )}
          {!deal.deal_date && deal.date && <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)", marginLeft: 8 }}>{deal.date}</span>}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {live.length} {live.length === 1 ? "booking" : "bookings"} · {guests} {guests === 1 ? "guest" : "guests"} · <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatCurrency(paid)}</span>
        </div>
      </div>
      {bookings.map((b) => {
        const t = toneBadge(STATUS_TONE[b.status]);
        return (
          <div key={b.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, alignItems: "center", padding: "13px 22px", borderTop: "1px solid var(--line)", opacity: DEAD.has(b.status) ? 0.5 : 1 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{b.slot_time}</span>
            <span style={{ ...numeric, fontSize: 14, fontWeight: 600, letterSpacing: ".05em" }}>{b.confirmation_code ?? "—"}</span>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>{b.num_people} {b.num_people === 1 ? "guest" : "guests"}</span>
            <span style={{ fontSize: 14 }}>{formatCurrency(b.total_paid)}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={t.badge}><span style={t.dot} />{past && b.status === "confirmed" ? "not redeemed" : STATUS_LABEL[b.status]}</span>
              {b.redeemed_at && <span style={{ ...numeric, fontSize: 12, color: "var(--faint)" }}>{redeemedTime(b.redeemed_at)}</span>}
              {b.payment_followup && (
                <span style={toneBadge("danger").badge} title="A card declined — collect at the till">Follow up</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
