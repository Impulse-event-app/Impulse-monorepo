"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { UNLIMITED_SPOTS, dealApi, scheduleApi, venueApi, type Deal, type DealSchedule } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency } from "@/lib/utils";
import { FONT_DISPLAY, numeric, card, btnPrimary, iconBtn, iconBtnDanger, switchTrack, switchKnob } from "@/lib/ui";

const COLS = "2.2fr 2.4fr 1.1fr 1.5fr .7fr 1fr";
const PAST_COLS = "2.2fr 2.4fr 1.1fr 1.5fr 1.7fr";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "2026-10-28" → "28 Oct". */
function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** ["7:00 PM", "8:30 PM"] → "7–9pm": first start to the end of the last half-hour. */
function slotsWindow(slots: string[]) {
  const mins = slots
    .map((t) => /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(t.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => (Number(m[1]) % 12 + (m[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(m[2]));
  if (!mins.length) return slots.join(", ");
  const label = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    return `${h % 12 || 12}${m % 60 ? `:${String(m % 60).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  };
  const from = label(Math.min(...mins));
  const to = label(Math.min(Math.max(...mins) + 30, 24 * 60));
  return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -2)}–${to}` : `${from}–${to}`;
}

function DayChips({ days }: { days: number[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>
      {days.map((d) => (
        <span key={d} style={{ fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)" }}>{WEEKDAYS[d]}</span>
      ))}
    </div>
  );
}

function FillBar({ filled, total }: { filled: number; total: number }) {
  if (total >= UNLIMITED_SPOTS) {
    return <div style={{ fontSize: 13 }}><span style={{ fontWeight: 600 }}>{filled}</span> <span style={{ color: "var(--faint)" }}>booked · unlimited</span></div>;
  }
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <>
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>{filled}</span> <span style={{ color: "var(--faint)" }}>/ {total} booked</span>
      </div>
      <div style={{ height: 5, borderRadius: 5, background: "var(--sunken)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, background: filled >= total ? "var(--bad)" : "var(--accent)" }} />
      </div>
    </>
  );
}

const headerRow = { display: "grid", gap: 14, padding: "14px 22px", background: "var(--surface2)", ...numeric, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "var(--faint)" };
const rowBase = { display: "grid", gap: 14, alignItems: "center", padding: "18px 22px", borderTop: "1px solid var(--line)" };
const categoryTag = { ...numeric, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--accent)", background: "var(--accent-soft)", padding: "3px 8px", borderRadius: 6 };

/** A schedule with an end date runs on those dates only; one without repeats every week. */
function describeRange(s: DealSchedule) {
  if (s.starts_on && s.ends_on) return s.starts_on === s.ends_on ? fmtDate(s.starts_on) : `${fmtDate(s.starts_on)} – ${fmtDate(s.ends_on)}`;
  if (s.ends_on) return `Every week until ${fmtDate(s.ends_on)}`;
  if (s.starts_on) return `Every week from ${fmtDate(s.starts_on)}`;
  return "Every week";
}

const sectionEyebrow = { ...numeric, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" as const, color: "var(--faint)", margin: "0 0 12px" };

export default function DealsPage() {
  const { venue } = useVenue();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["deals", venue?.id],
    queryFn: () => venueApi.deals(venue!.id),
    enabled: !!venue,
  });

  const { data: schedules = [] } = useQuery<DealSchedule[]>({
    queryKey: ["schedules", venue?.id],
    queryFn: () => scheduleApi.list(venue!.id),
    enabled: !!venue,
  });

  const toggleSchedule = useMutation({
    // PUT replaces the whole schedule, so send it back with only is_active flipped.
    mutationFn: (s: DealSchedule) =>
      scheduleApi.update(s.id, {
        title: s.title, category: s.category, description: s.description ?? undefined, unit: s.unit ?? undefined,
        original_price: s.original_price, discount_pct: s.discount_pct, slots: s.slots, weekdays: s.weekdays,
        starts_on: s.starts_on, ends_on: s.ends_on, max_group_size: s.max_group_size, total_spots: s.total_spots,
        is_active: !s.is_active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules", venue?.id] });
      qc.invalidateQueries({ queryKey: ["deals", venue?.id] });
    },
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: string) => scheduleApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules", venue?.id] }),
  });

  function confirmDeleteSchedule(s: DealSchedule) {
    if (confirm(`Stop "${s.title}" running every week? Deals it already made stay in your list.`)) deleteSchedule.mutate(s.id);
  }

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => dealApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals", venue?.id] }),
  });

  const deleteDeal = useMutation({
    mutationFn: (id: string) => dealApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals", venue?.id] }),
  });

  function confirmDelete(deal: Deal) {
    if (confirm(`Delete "${deal.title}"? This cannot be undone.`)) deleteDeal.mutate(deal.id);
  }

  // "2026-10-27" for the venue's day (the browser is in Sydney); taken once per visit.
  const [today] = useState(() => new Date().toLocaleDateString("en-CA"));

  if (!venue) return null;

  const isPast = (d: Deal) =>
    d.deal_date ? d.deal_date < today : d.expires_at ? new Date(d.expires_at).toLocaleDateString("en-CA") < today : false;

  // A schedule's daily deals live on the schedule's row, not as rows of their own.
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const tonightRun = new Map(deals.filter((d) => d.schedule_id && d.deal_date === today).map((d) => [d.schedule_id!, d]));
  const oneOffs = deals.filter((d) => !isPast(d) && !(d.schedule_id && scheduleIds.has(d.schedule_id)));

  // Past runs of the same deal collapse into one line.
  const past = (() => {
    const groups = new Map<string, { title: string; category: string; dates: string[]; booked: number; capacity: number; latestId: string }>();
    for (const d of deals.filter(isPast)) {
      const key = `${d.title.trim().toLowerCase()}|${d.category}`;
      const g = groups.get(key) ?? { title: d.title, category: d.category, dates: [], booked: 0, capacity: 0, latestId: d.id };
      const when = d.deal_date ?? d.created_at.slice(0, 10);
      if (!g.dates.length || when > g.dates[g.dates.length - 1]) g.latestId = d.id;
      g.dates.push(when);
      const filled = d.total_spots - d.spots_remaining;
      g.booked += filled;
      g.capacity += d.total_spots >= UNLIMITED_SPOTS ? filled : d.total_spots;
      groups.set(key, g);
    }
    return [...groups.values()]
      .map((g) => ({ ...g, dates: g.dates.sort() }))
      .sort((a, b) => b.dates[b.dates.length - 1].localeCompare(a.dates[a.dates.length - 1]));
  })();

  const nothingLive = schedules.length === 0 && oneOffs.length === 0;

  return (
    <div style={{ padding: "38px 44px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ ...numeric, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Your deals</div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 32, letterSpacing: "-.02em", margin: 0 }}>Deals</h1>
        </div>
        <button onClick={() => router.push("/dashboard/deals/new")} style={{ ...btnPrimary, padding: "12px 18px", borderRadius: 11, boxShadow: "0 8px 22px var(--accent-soft)" }}>
          + New deal
        </button>
      </div>

      <h2 style={sectionEyebrow}>Live &amp; upcoming</h2>
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ ...card, borderRadius: 16, height: 72, animation: "pm-glow 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : nothingLive ? (
        <div style={{ ...card, borderRadius: 16, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>Nothing live or coming up.</p>
          <button onClick={() => router.push("/dashboard/deals/new")} style={{ marginTop: 16, background: "none", border: "none", color: "var(--accent)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Create a deal →
          </button>
        </div>
      ) : (
        <div style={{ ...card, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ ...headerRow, gridTemplateColumns: COLS }}>
            <span>Deal</span><span>When</span><span>Price</span><span>Tonight</span><span>On</span><span style={{ textAlign: "right" }}>Actions</span>
          </div>

          {/* Deals that run on several days (or every week): one row each */}
          {schedules.map((s) => {
            const run = tonightRun.get(s.id);
            return (
              <div key={s.id} style={{ ...rowBase, gridTemplateColumns: COLS, opacity: s.is_active ? 1 : 0.6 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>{s.title}</div>
                  <span style={categoryTag}>{s.category}</span>
                </div>
                <div style={{ fontSize: 13 }}>
                  <DayChips days={s.weekdays} />
                  <div style={{ color: "var(--muted)" }}>{describeRange(s)} · {slotsWindow(s.slots)}</div>
                </div>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{formatCurrency(s.deal_price)}</span>
                  <span style={{ fontSize: 12, color: "var(--faint)", textDecoration: "line-through", marginLeft: 6 }}>{formatCurrency(s.original_price)}</span>
                </div>
                <div>
                  {run ? <FillBar filled={run.total_spots - run.spots_remaining} total={run.total_spots} /> : <span style={{ fontSize: 13, color: "var(--faint)" }}>Not on tonight</span>}
                </div>
                <div>
                  <button onClick={() => toggleSchedule.mutate(s)} style={switchTrack(s.is_active)} title={s.is_active ? "Pause" : "Resume"} aria-pressed={s.is_active}>
                    <span style={switchKnob(s.is_active)} />
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {run && <button onClick={() => router.push(`/dashboard/bookings?deal_id=${run.id}`)} title="Tonight's bookings" style={iconBtn}>☰</button>}
                  <button onClick={() => router.push(`/dashboard/deals/schedules/${s.id}/edit`)} title="Edit" style={iconBtn}>✎</button>
                  <button onClick={() => confirmDeleteSchedule(s)} title="Delete" style={iconBtnDanger}>✕</button>
                </div>
              </div>
            );
          })}

          {/* Single-day deals */}
          {oneOffs.map((d) => (
            <div key={d.id} style={{ ...rowBase, gridTemplateColumns: COLS }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>{d.title}</div>
                <span style={categoryTag}>{d.category}</span>
              </div>
              <div style={{ fontSize: 13 }}>
                {d.deal_date && <DayChips days={[(new Date(`${d.deal_date}T12:00:00`).getDay() + 6) % 7]} />}
                <div style={{ color: "var(--muted)" }}>
                  {/* Older deals carry their time in a free-text date ("Tonight · 6–9pm") */}
                  {d.deal_date ? `${d.deal_date === today ? "Tonight" : fmtDate(d.deal_date)} · ${slotsWindow(d.slots)}` : d.date}
                </div>
              </div>
              <div>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{formatCurrency(d.deal_price)}</span>
                <span style={{ fontSize: 12, color: "var(--faint)", textDecoration: "line-through", marginLeft: 6 }}>{formatCurrency(d.original_price)}</span>
              </div>
              <div>
                <FillBar filled={d.total_spots - d.spots_remaining} total={d.total_spots} />
              </div>
              <div>
                <button onClick={() => toggleActive.mutate({ id: d.id, is_active: !d.is_active })} style={switchTrack(d.is_active)} title={d.is_active ? "Deactivate" : "Activate"}>
                  <span style={switchKnob(d.is_active)} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => router.push(`/dashboard/bookings?deal_id=${d.id}`)} title="Bookings" style={iconBtn}>☰</button>
                <button onClick={() => router.push(`/dashboard/deals/${d.id}/edit`)} title="Edit" style={iconBtn}>✎</button>
                <button onClick={() => confirmDelete(d)} title="Delete" style={iconBtnDanger}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <section style={{ marginTop: 34 }}>
          <h2 style={sectionEyebrow}>Past deals</h2>
          <div style={{ ...card, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ ...headerRow, gridTemplateColumns: PAST_COLS }}>
              <span>Deal</span><span>Ran</span><span>Guests</span><span>Average fill</span><span />
            </div>
            {past.map((g) => {
              const fill = g.capacity > 0 ? Math.round((g.booked / g.capacity) * 100) : 0;
              const first = g.dates[0];
              const last = g.dates[g.dates.length - 1];
              return (
                <div key={`${g.title}|${g.category}`} style={{ ...rowBase, gridTemplateColumns: PAST_COLS }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>{g.title}</div>
                    <span style={categoryTag}>{g.category}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>{g.dates.length} day{g.dates.length === 1 ? "" : "s"}</div>
                    <div style={{ color: "var(--muted)" }}>{first === last ? fmtDate(first) : `${fmtDate(first)} – ${fmtDate(last)}`}</div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15, ...numeric }}>{g.booked}</div>
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{fill}%</span> <span style={{ color: "var(--faint)" }}>full</span></div>
                    <div style={{ height: 5, borderRadius: 5, background: "var(--sunken)", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${fill}%`, background: "var(--muted)" }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <button onClick={() => router.push(`/dashboard/bookings?deal_id=${g.latestId}`)} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Latest bookings →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
