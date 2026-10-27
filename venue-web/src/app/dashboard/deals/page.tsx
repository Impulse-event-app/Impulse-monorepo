"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { dealApi, scheduleApi, venueApi, type Deal, type DealSchedule } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency } from "@/lib/utils";
import { FONT_DISPLAY, numeric, card, btnPrimary, iconBtn, iconBtnDanger, switchTrack, switchKnob } from "@/lib/ui";

const COLS = "2.4fr 1.2fr 1.2fr 1.4fr .8fr 1fr";
const SCHEDULE_COLS = "2.4fr 2.6fr 1.2fr .8fr 1fr";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function describeDays(days: number[]) {
  if (days.length === 7) return "Every day";
  if (days.join() === "0,1,2,3,4") return "Weekdays";
  if (days.join() === "5,6") return "Weekends";
  return days.map((d) => WEEKDAYS[d]).join(" · ");
}

function describeRange(s: DealSchedule) {
  const fmt = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  if (s.starts_on && s.ends_on) return `${fmt(s.starts_on)} – ${fmt(s.ends_on)}`;
  if (s.starts_on) return `From ${fmt(s.starts_on)}`;
  if (s.ends_on) return `Until ${fmt(s.ends_on)}`;
  return null;
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

  if (!venue) return null;

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

      {schedules.length > 0 && (
        <section style={{ marginBottom: 34 }}>
          <h2 style={sectionEyebrow}>Weekly</h2>
          <div style={{ ...card, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: SCHEDULE_COLS, gap: 14, padding: "14px 22px", background: "var(--surface2)", ...numeric, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)" }}>
              <span>Deal</span><span>Runs</span><span>Price</span><span>On</span><span style={{ textAlign: "right" }}>Actions</span>
            </div>
            {schedules.map((s) => {
              const range = describeRange(s);
              return (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: SCHEDULE_COLS, gap: 14, alignItems: "center", padding: "18px 22px", borderTop: "1px solid var(--line)", opacity: s.is_active ? 1 : 0.6 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>{s.title}</div>
                    <span style={{ ...numeric, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)", background: "var(--accent-soft)", padding: "3px 8px", borderRadius: 6 }}>{s.category}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>{describeDays(s.weekdays)}</div>
                    <div style={{ color: "var(--muted)" }}>
                      {s.slots.join(", ")} · {s.total_spots} spots{range ? ` · ${range}` : ""}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{formatCurrency(s.deal_price)}</span>
                    <span style={{ fontSize: 12, color: "var(--faint)", textDecoration: "line-through", marginLeft: 6 }}>{formatCurrency(s.original_price)}</span>
                    {s.unit && <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{s.unit}</div>}
                  </div>
                  <div>
                    <button onClick={() => toggleSchedule.mutate(s)} style={switchTrack(s.is_active)} title={s.is_active ? "Pause" : "Resume"} aria-pressed={s.is_active}>
                      <span style={switchKnob(s.is_active)} />
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => router.push(`/dashboard/deals/schedules/${s.id}/edit`)} title="Edit" style={iconBtn}>✎</button>
                    <button onClick={() => confirmDeleteSchedule(s)} title="Delete" style={iconBtnDanger}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {schedules.length > 0 && <h2 style={sectionEyebrow}>Deals</h2>}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ ...card, borderRadius: 16, height: 72, animation: "pm-glow 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div style={{ ...card, borderRadius: 16, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>{schedules.length ? "No deals yet. Weekly deals appear here on the days they run." : "No deals yet."}</p>
          <button onClick={() => router.push("/dashboard/deals/new")} style={{ marginTop: 16, background: "none", border: "none", color: "var(--accent)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Create your first deal →
          </button>
        </div>
      ) : (
        <div style={{ ...card, borderRadius: 16, overflow: "hidden" }}>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, padding: "14px 22px", background: "var(--surface2)", ...numeric, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)" }}>
            <span>Deal</span><span>Date</span><span>Price</span><span>Spots</span><span>Active</span><span style={{ textAlign: "right" }}>Actions</span>
          </div>

          {deals.map((d) => {
            const filled = d.total_spots - d.spots_remaining;
            const pct = d.total_spots > 0 ? Math.round((filled / d.total_spots) * 100) : 0;
            const barColor = d.spots_remaining === 0 ? "var(--bad)" : "var(--accent)";
            return (
              <div key={d.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, alignItems: "center", padding: "18px 22px", borderTop: "1px solid var(--line)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>{d.title}</div>
                  <span style={{ ...numeric, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)", background: "var(--accent-soft)", padding: "3px 8px", borderRadius: 6 }}>{d.category}</span>
                  {d.schedule_id && (
                    <span style={{ ...numeric, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", background: "var(--chip-bg)", padding: "3px 8px", borderRadius: 6, marginLeft: 6 }}>Weekly</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>{d.date}</div>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{formatCurrency(d.deal_price)}</span>
                  <span style={{ fontSize: 12, color: "var(--faint)", textDecoration: "line-through", marginLeft: 6 }}>{formatCurrency(d.original_price)}</span>
                  {d.unit && <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{d.unit}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{d.spots_remaining}</span> <span style={{ color: "var(--faint)" }}>/ {d.total_spots} left</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 5, background: "var(--sunken)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${pct}%`, background: barColor }} />
                  </div>
                </div>
                <div>
                  <button
                    onClick={() => toggleActive.mutate({ id: d.id, is_active: !d.is_active })}
                    style={switchTrack(d.is_active)}
                    title={d.is_active ? "Deactivate" : "Activate"}
                  >
                    <span style={switchKnob(d.is_active)} />
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button onClick={() => router.push(`/dashboard/bookings?deal_id=${d.id}`)} title="Bookings" style={iconBtn}>☰</button>
                  <button onClick={() => router.push(`/dashboard/deals/${d.id}/edit`)} title="Edit" style={iconBtn}>✎</button>
                  <button onClick={() => confirmDelete(d)} title="Delete" style={iconBtnDanger}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
