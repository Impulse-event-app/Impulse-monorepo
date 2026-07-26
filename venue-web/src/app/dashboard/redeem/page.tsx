"use client";

import { useRef, useState } from "react";
import {
  bookingApi,
  huddleApi,
  type RedeemResponse,
  type HuddleVerifyResponse,
  type HuddleVerifyMember,
  type HuddleRedeemResponse,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FONT_DISPLAY, FONT_MONO, card, btnPrimary, btnGhost, toneBadge } from "@/lib/ui";

type BookingState =
  | { kind: "success"; data: RedeemResponse }
  | { kind: "already_redeemed"; data: RedeemResponse; redeemedAt: string }
  | { kind: "cancelled"; code: string }
  | { kind: "not_found"; code: string }
  | { kind: "wrong_venue"; code: string }
  | { kind: "error"; message: string };

type RedeemState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "huddle_preview"; data: HuddleVerifyResponse; code: string }
  | { kind: "huddle_confirming"; data: HuddleVerifyResponse; code: string }
  | { kind: "huddle_result"; data: HuddleRedeemResponse; venueName: string }
  | BookingState;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function RedeemPage() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<RedeemState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const showCard = state.kind !== "idle" && state.kind !== "loading";

  async function redeem(rawCode: string) {
    const trimmed = rawCode.replace(/\D/g, "").slice(0, 6);
    if (trimmed.length < 6) return;
    setCode(trimmed);
    setState({ kind: "loading" });

    // 1) Group (huddle) code? Preview before charging.
    try {
      const hres = await huddleApi.verify(trimmed);
      if (hres.ok) {
        const data: HuddleVerifyResponse = await hres.json();
        if (data.already_redeemed) {
          setState({ kind: "error", message: `Group code ${trimmed} was already redeemed.` });
        } else {
          setState({ kind: "huddle_preview", data, code: trimmed });
        }
        return;
      }
      if (hres.status === 403) {
        setState({ kind: "wrong_venue", code: trimmed });
        return;
      }
      // 404 → not a huddle code; fall through.
    } catch {
      // network issue on the huddle probe — fall through
    }

    // 2) Single-booking code.
    try {
      const res = await bookingApi.redeem(trimmed);
      if (res.ok) {
        const data: RedeemResponse = await res.json();
        setState({ kind: "success", data });
        return;
      }
      if (res.status === 409) {
        let data: RedeemResponse | null = null;
        try { data = await res.json(); } catch { /* ignore */ }
        const redeemedAt = res.headers.get("X-Redeemed-At") ?? data?.redeemed_at ?? "unknown time";
        if (data?.status === "cancelled") {
          setState({ kind: "cancelled", code: trimmed });
        } else if (!data?.status) {
          const detail = (data as { detail?: string } | null)?.detail;
          setState({ kind: "error", message: detail ?? "Ticket cannot be redeemed" });
        } else {
          setState({ kind: "already_redeemed", data: data!, redeemedAt: typeof redeemedAt === "string" ? redeemedAt : String(redeemedAt) });
        }
        return;
      }
      if (res.status === 404) { setState({ kind: "not_found", code: trimmed }); return; }
      if (res.status === 403) { setState({ kind: "wrong_venue", code: trimmed }); return; }
      setState({ kind: "error", message: `Unexpected error (${res.status})` });
    } catch (err: unknown) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }

  async function confirmHuddle(data: HuddleVerifyResponse, huddleCode: string) {
    setState({ kind: "huddle_confirming", data, code: huddleCode });
    try {
      const result = await huddleApi.redeem(huddleCode);
      setState({ kind: "huddle_result", data: result, venueName: data.venue_name });
    } catch (err: unknown) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Charge failed" });
    }
  }

  function reset() {
    setState({ kind: "idle" });
    setCode("");
    inputRef.current?.focus();
  }

  const digits = Array.from({ length: 6 }, (_, i) => code[i] ?? "");

  return (
    <div style={{ padding: "38px 44px", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 10 }}>Front of house</div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 34, letterSpacing: "-.02em", margin: "0 0 6px" }}>Redeem a code</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>
          Enter the guest&apos;s 6-digit code. Group codes preview every member before you charge.
        </p>
      </div>

      {/* Code entry — 6 boxes over a hidden input */}
      <div style={{ position: "relative", display: "flex", gap: 12, justifyContent: "center", marginBottom: 18 }}>
        <input
          ref={inputRef}
          value={code}
          autoFocus
          inputMode="numeric"
          maxLength={6}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(next);
            if (state.kind !== "idle" && state.kind !== "loading") setState({ kind: "idle" });
            if (next.length === 6) redeem(next);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") redeem(code); }}
          aria-label="6-digit confirmation code"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "text", border: "none", background: "transparent" }}
        />
        {digits.map((d, i) => {
          const active = i === code.length;
          return (
            <div
              key={i}
              onClick={() => inputRef.current?.focus()}
              style={{
                width: 64, height: 80, borderRadius: 14,
                border: `1.5px solid ${active ? "var(--accent)" : "var(--line2)"}`,
                background: "var(--surface)", display: "grid", placeItems: "center",
                fontFamily: FONT_MONO, fontWeight: 700, fontSize: 34, color: "var(--text)",
              }}
            >
              {d}
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center", marginBottom: 28, minHeight: 18 }}>
        {state.kind === "loading" && <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "var(--muted)" }}>● CHECKING…</span>}
        {(state.kind === "huddle_preview" || state.kind === "huddle_confirming") && (
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "var(--accent)" }}>● GROUP HUDDLE CODE · {state.data.group_size} members</span>
        )}
      </div>

      {/* Group preview / confirm */}
      {(state.kind === "huddle_preview" || state.kind === "huddle_confirming") && (
        <HuddlePreviewCard data={state.data} confirming={state.kind === "huddle_confirming"} onConfirm={() => confirmHuddle(state.data, state.code)} onCancel={reset} />
      )}

      {/* Group result */}
      {state.kind === "huddle_result" && <HuddleResultCard data={state.data} venueName={state.venueName} onReset={reset} />}

      {/* Booking result */}
      {showCard && !state.kind.startsWith("huddle_") && <ResultCard state={state as BookingState} onReset={reset} />}
    </div>
  );
}

// ── Huddle: group preview ─────────────────────────────────────────────────────

function memberNote(m: HuddleVerifyMember): string {
  if (m.balance_status === "declined") return "Card declined · retry at till";
  if (m.balance_status === "paid") return "Paid in app";
  return "Card on file";
}

function HuddlePreviewCard({
  data, confirming, onConfirm, onCancel,
}: {
  data: HuddleVerifyResponse;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const readyCount = data.members.filter((m) => m.balance_status !== "declined").length;
  const declinedCount = data.members.length - readyCount;

  return (
    <>
      <div style={{ ...card, border: "1px solid var(--line2)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", background: "var(--surface2)", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18 }}>{data.deal_title} · Huddle</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{data.venue_name} · {data.slot} slot</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)" }}>Total to charge</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 26, color: "var(--accent)" }}>{money(data.total_balance_cents)}</div>
          </div>
        </div>

        {/* members */}
        <div style={{ padding: "8px 24px" }}>
          {data.members.map((m, i) => {
            const ready = m.balance_status !== "declined";
            const t = toneBadge(ready ? "soft" : "danger");
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 0", borderBottom: i === data.members.length - 1 ? "none" : "1px solid var(--line)" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--surface2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: "var(--muted)" }}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--faint)" }}>{memberNote(m)}</div>
                </div>
                <div style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 16 }}>{money(m.balance_cents)}</div>
                <span style={t.badge}><span style={t.dot} />{ready ? "Ready" : "Declined"}</span>
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div style={{ display: "flex", gap: 12, padding: "20px 24px", background: "var(--surface2)", borderTop: "1px solid var(--line)" }}>
          <button onClick={onCancel} disabled={confirming} style={{ ...btnGhost, flex: 1, padding: 15, fontSize: 15 }}>Cancel</button>
          <button onClick={onConfirm} disabled={confirming} style={{ ...btnPrimary, flex: 2, padding: 15, fontSize: 15, opacity: confirming ? 0.6 : 1, cursor: confirming ? "not-allowed" : "pointer" }}>
            {confirming ? "Charging the group…" : `Charge group · ${money(data.total_balance_cents)} →`}
          </button>
        </div>
      </div>

      {/* status strip */}
      <div style={{ display: "flex", gap: 14, marginTop: 20 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--surface)" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: "var(--muted)" }}><b style={{ color: "var(--text)" }}>{readyCount} member{readyCount === 1 ? "" : "s"} ready</b> — cards authorised and will settle instantly.</div>
        </div>
        {declinedCount > 0 && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 14, border: "1px solid color-mix(in oklab, var(--bad) 40%, var(--line))", background: "color-mix(in oklab, var(--bad) 8%, var(--surface))" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--bad)", flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: "var(--muted)" }}><b style={{ color: "var(--text)" }}>{declinedCount} declined</b> — collect at the till. You can still charge the rest.</div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Huddle: per-member charge result ──────────────────────────────────────────

function HuddleResultCard({ data, venueName, onReset }: { data: HuddleRedeemResponse; venueName: string; onReset: () => void }) {
  const allPaid = data.declines === 0;
  return (
    <div style={{ ...card, border: "1px solid var(--line2)", padding: 24, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19 }}>
            Group redeemed{allPaid ? " — all paid" : ` — ${data.declines} to collect`}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>{money(data.total_charged_cents)} charged at {venueName}.</div>
        </div>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: allPaid ? "var(--good)" : "var(--warn)", marginTop: 6 }} />
      </div>

      <div>
        {data.members.map((m, i) => {
          const paid = m.status === "paid";
          const t = toneBadge(paid ? "good" : "danger");
          return (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{m.name}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 14 }}>{money(m.balance_cents)}</span>
                <span style={t.badge}><span style={t.dot} />{paid ? "Charged" : "Declined"}</span>
              </div>
              {m.warning && (
                <p style={{ margin: "8px 0 4px", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600, background: "color-mix(in oklab, var(--warn) 14%, transparent)", border: "1px solid color-mix(in oklab, var(--warn) 35%, transparent)", color: "var(--text)" }}>{m.warning}</p>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={onReset} style={{ ...btnGhost, width: "100%", marginTop: 18, padding: 13 }}>Check another</button>
    </div>
  );
}

// ── Single-booking result ─────────────────────────────────────────────────────

function ResultCard({ state, onReset }: { state: BookingState; onReset: () => void }) {
  const tone: "good" | "warn" | "bad" =
    state.kind === "success" ? "good" : state.kind === "already_redeemed" || state.kind === "cancelled" ? "warn" : "bad";
  const toneVar = tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : "var(--bad)";

  return (
    <div style={{ ...card, border: `1px solid color-mix(in oklab, ${toneVar} 35%, var(--line2))`, background: `color-mix(in oklab, ${toneVar} 7%, var(--surface))`, padding: 24, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: toneVar, marginTop: 7, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19 }}>{resultTitle(state)}</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 3 }}>{resultBody(state)}</div>

          {(state.kind === "success" || state.kind === "already_redeemed") && (
            <dl style={{ marginTop: 16, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", fontSize: 14 }}>
              <dt style={{ color: "var(--faint)" }}>Slot</dt>
              <dd style={{ fontWeight: 600, margin: 0 }}>{state.data.slot_time}</dd>
              <dt style={{ color: "var(--faint)" }}>Party size</dt>
              <dd style={{ fontWeight: 600, margin: 0 }}>{state.data.num_people}</dd>
              {state.data.balance_amount_cents != null && (
                <>
                  <dt style={{ color: "var(--faint)" }}>Balance</dt>
                  <dd style={{ fontWeight: 600, margin: 0 }}>
                    {money(state.data.balance_amount_cents)}
                    {state.data.payment_status === "fully_paid" ? " — charged" : ""}
                  </dd>
                </>
              )}
            </dl>
          )}

          {state.kind === "success" && state.data.payment_warning && (
            <p style={{ marginTop: 14, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600, background: "color-mix(in oklab, var(--warn) 14%, transparent)", border: "1px solid color-mix(in oklab, var(--warn) 35%, transparent)", color: "var(--text)" }}>{state.data.payment_warning}</p>
          )}
        </div>
      </div>

      <button onClick={onReset} style={{ ...btnGhost, width: "100%", marginTop: 18, padding: 13 }}>Check another</button>
    </div>
  );
}

function resultTitle(state: BookingState): string {
  switch (state.kind) {
    case "success": return "Valid ticket — enjoy!";
    case "already_redeemed": return "Already redeemed";
    case "cancelled": return "Booking cancelled";
    case "not_found": return "Code not found";
    case "wrong_venue": return "Wrong venue";
    case "error": return "Something went wrong";
  }
}

function resultBody(state: BookingState): string {
  switch (state.kind) {
    case "success": return `${state.data.confirmation_code} marked as attended.`;
    case "already_redeemed": return `This ticket was redeemed at ${formatDate(state.redeemedAt)}.`;
    case "cancelled": return `${state.code} belongs to a cancelled booking.`;
    case "not_found": return `No booking found for ${state.code}.`;
    case "wrong_venue": return `${state.code} belongs to a different venue.`;
    case "error": return state.message;
  }
}
