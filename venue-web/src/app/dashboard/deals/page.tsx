"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { dealApi, venueApi, type Deal } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency } from "@/lib/utils";
import { FONT_DISPLAY, FONT_MONO, card, btnPrimary, iconBtn, iconBtnDanger, switchTrack, switchKnob } from "@/lib/ui";

const COLS = "2.4fr 1.2fr 1.2fr 1.4fr .8fr 1fr";

export default function DealsPage() {
  const { venue } = useVenue();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["deals", venue?.id],
    queryFn: () => venueApi.deals(venue!.id),
    enabled: !!venue,
  });

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
          <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Your deals</div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-.02em", margin: 0 }}>Deals</h1>
        </div>
        <button onClick={() => router.push("/dashboard/deals/new")} style={{ ...btnPrimary, padding: "12px 18px", borderRadius: 11, boxShadow: "0 8px 22px var(--accent-soft)" }}>
          + New deal
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ ...card, borderRadius: 16, height: 72, animation: "pm-glow 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div style={{ ...card, borderRadius: 16, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>No deals yet.</p>
          <button onClick={() => router.push("/dashboard/deals/new")} style={{ marginTop: 16, background: "none", border: "none", color: "var(--accent)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Create your first deal →
          </button>
        </div>
      ) : (
        <div style={{ ...card, borderRadius: 16, overflow: "hidden" }}>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, padding: "14px 22px", background: "var(--surface2)", fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)" }}>
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
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)", background: "var(--accent-soft)", padding: "3px 8px", borderRadius: 6 }}>{d.category}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>{d.date}</div>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{formatCurrency(d.deal_price)}</span>
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
