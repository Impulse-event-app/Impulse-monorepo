"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { bookingApi, venueApi, type Booking, type Deal } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FONT_DISPLAY, FONT_MONO, card, toneBadge, type Tone } from "@/lib/ui";

const COLS = "1fr 1fr 1fr 1fr 1.2fr 1fr";

const STATUS_TONE: Record<Booking["status"], Tone> = {
  confirmed: "soft",
  attended: "solid",
  cancelled: "danger",
  pending: "neutral",
};

export default function BookingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 44, color: "var(--faint)", fontSize: 14 }}>Loading…</div>}>
      <BookingsContent />
    </Suspense>
  );
}

function BookingsContent() {
  const { venue } = useVenue();
  const searchParams = useSearchParams();
  const dealId = searchParams.get("deal_id");

  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ["deals", venue?.id],
    queryFn: () => venueApi.deals(venue!.id),
    enabled: !!venue,
  });

  const selectedDealId = dealId ?? deals[0]?.id ?? null;

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["bookings", selectedDealId],
    queryFn: () => bookingApi.listForDeal(selectedDealId!),
    enabled: !!selectedDealId,
  });

  if (!venue) return null;

  return (
    <div style={{ padding: "38px 44px" }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Bookings</div>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 24px" }}>Bookings</h1>

      {/* Deal filter pills */}
      {deals.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          {deals.map((d) => {
            const on = d.id === selectedDealId;
            return (
              <Link
                key={d.id}
                href={`/dashboard/bookings?deal_id=${d.id}`}
                style={{
                  padding: "9px 15px", borderRadius: 999, fontSize: 13, fontWeight: 600,
                  border: `1px solid ${on ? "transparent" : "var(--line2)"}`,
                  background: on ? "var(--accent)" : "var(--surface)",
                  color: on ? "var(--accent-ink)" : "var(--muted)",
                }}
              >
                {d.title}
              </Link>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ ...card, borderRadius: 14, height: 56, animation: "pm-glow 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div style={{ ...card, borderRadius: 16, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>No bookings for this deal yet.</p>
        </div>
      ) : (
        <div style={{ ...card, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, padding: "14px 22px", background: "var(--surface2)", fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)" }}>
            <span>Code</span><span>Slot</span><span>Party</span><span>Paid</span><span>Status</span><span>Redeemed</span>
          </div>
          {bookings.map((b) => {
            const t = toneBadge(STATUS_TONE[b.status]);
            return (
              <div key={b.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, alignItems: "center", padding: "16px 22px", borderTop: "1px solid var(--line)" }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, letterSpacing: ".05em" }}>{b.confirmation_code ?? "—"}</span>
                <span style={{ fontSize: 14, color: "var(--muted)" }}>{b.slot_time}</span>
                <span style={{ fontSize: 14 }}>{b.num_people} {b.num_people === 1 ? "guest" : "guests"}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{formatCurrency(b.total_paid)}</span>
                <span>
                  <span style={t.badge}><span style={t.dot} />{b.status}</span>
                </span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: "var(--muted)" }}>{b.redeemed_at ? formatDate(b.redeemed_at) : "—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
