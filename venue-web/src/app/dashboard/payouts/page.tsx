"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { venueApi, type Payout, type PayoutsResponse } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FONT_DISPLAY, FONT_MONO, card, toneBadge, type Tone } from "@/lib/ui";

const COLS = "1.1fr 1.5fr 1fr 1fr 40px";

/** Pinch transfer statuses, mapped to how alarming they should look. */
const STATUS_TONE: Record<string, Tone> = {
  complete: "good",
  processing: "info",
  "pending-return": "neutral",
  withheld: "neutral",
  "negative-balance": "danger",
  failed: "danger",
  "failed-return": "danger",
};

const STATUS_LABEL: Record<string, string> = {
  complete: "Paid",
  processing: "On its way",
  "pending-return": "Pending return",
  withheld: "Withheld",
  "negative-balance": "Negative balance",
  failed: "Failed",
  "failed-return": "Failed return",
};

function money(cents: number): string {
  return formatCurrency(cents / 100);
}

function payoutDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function PayoutsPage() {
  const { venue } = useVenue();

  const { data, isLoading } = useQuery<PayoutsResponse>({
    queryKey: ["payouts", venue?.id],
    queryFn: () => venueApi.payouts(venue!.id),
    enabled: !!venue,
    refetchInterval: 60_000,
  });

  if (!venue) return null;

  const summary = data?.summary;
  const payouts = data?.payouts ?? [];

  const cards = summary
    ? [
        { label: "Paid out", value: money(summary.paid_cents), sub: summary.last_payout_date ? `Last ${payoutDate(summary.last_payout_date)}` : "No payouts yet" },
        { label: "On its way", value: money(summary.in_transit_cents), sub: "Sent, not yet cleared" },
        { label: "Awaiting payout", value: money(summary.awaiting_cents), sub: "Earned, not yet sent" },
        { label: "Payouts", value: String(summary.payout_count), sub: "All time" },
      ]
    : [];

  return (
    <div style={{ padding: "38px 44px" }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>
        Payouts
      </div>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 6px" }}>
        Payouts
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 26px", maxWidth: 620 }}>
        Money on its way to your bank account. A booking being paid isn&apos;t the same as the
        cash arriving — this is the second one.
      </p>

      {/* Summary */}
      <div className="payout-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 26 }}>
        {isLoading || !summary
          ? [...Array(4)].map((_, i) => (
              <div key={i} style={{ ...card, borderRadius: 16, height: 118, animation: "pm-glow 1.4s ease-in-out infinite" }} />
            ))
          : cards.map((c) => (
              <div key={c.label} style={{ ...card, borderRadius: 16, padding: 22 }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
                  {c.label}
                </div>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30, letterSpacing: "-.02em", lineHeight: 1, whiteSpace: "nowrap" }}>
                  {c.value}
                </div>
                <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>{c.sub}</div>
              </div>
            ))}
      </div>

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ ...card, borderRadius: 14, height: 56, animation: "pm-glow 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : payouts.length === 0 ? (
        <div style={{ ...card, borderRadius: 16, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--text)", fontWeight: 600, margin: "0 0 6px" }}>No payouts yet</p>
          <p style={{ color: "var(--muted)", fontSize: 14, margin: 0, maxWidth: 420, marginInline: "auto" }}>
            Once a guest redeems a booking and the funds clear, the transfer shows up here with
            the bookings it covers.
          </p>
        </div>
      ) : (
        <div style={{ ...card, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, padding: "14px 22px", background: "var(--surface2)", fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)" }}>
            <span>Date</span><span>Reference</span><span>Status</span><span style={{ textAlign: "right" }}>Amount</span><span />
          </div>
          {payouts.map((p) => (
            <PayoutRow key={p.id} payout={p} />
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 1000px) {
          .payout-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

function PayoutRow({ payout }: { payout: Payout }) {
  const [open, setOpen] = useState(false);
  const tone = toneBadge(STATUS_TONE[payout.status] ?? "neutral");
  const label = STATUS_LABEL[payout.status] ?? payout.status;

  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, alignItems: "center", padding: "16px 22px", cursor: "pointer" }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>{payoutDate(payout.transfer_date)}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {payout.reference ?? payout.pinch_transfer_id}
        </span>
        <span>
          <span style={tone.badge}><span style={tone.dot} />{label}</span>
        </span>
        <span style={{ fontWeight: 700, fontSize: 15, textAlign: "right" }}>{money(payout.amount_cents)}</span>
        <span style={{ color: "var(--faint)", fontSize: 12, textAlign: "right", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
          ›
        </span>
      </div>

      {open && (
        <div style={{ padding: "0 22px 18px", background: "var(--surface2)" }}>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", padding: "14px 0 12px", fontSize: 12.5, color: "var(--muted)" }}>
            {payout.account_name && (
              <span>
                To <strong style={{ color: "var(--text)" }}>{payout.account_name}</strong>
                {payout.account_number ? ` · ${payout.bsb ?? ""} ${payout.account_number}` : ""}
              </span>
            )}
            <span style={{ fontFamily: FONT_MONO }}>{payout.pinch_transfer_id}</span>
          </div>

          {payout.lines.length === 0 ? (
            <p style={{ color: "var(--faint)", fontSize: 13, margin: 0 }}>No bookings on this payout.</p>
          ) : (
            payout.lines.map((ln, i) => (
              <div
                key={`${ln.booking_id ?? "line"}-${i}`}
                style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 90px", gap: 14, alignItems: "center", padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)", fontSize: 13 }}
              >
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, letterSpacing: ".05em" }}>
                  {ln.confirmation_code ?? "—"}
                </span>
                <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ln.deal_title ?? "—"}
                </span>
                <span style={{ color: "var(--faint)", fontSize: 12 }}>
                  {ln.transaction_date ? formatDate(ln.transaction_date) : "—"}
                </span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{money(ln.amount_cents)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
