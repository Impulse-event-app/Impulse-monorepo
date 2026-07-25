"use client";

import { useState } from "react";
import {
  bookingApi,
  huddleApi,
  type RedeemResponse,
  type HuddleVerifyResponse,
  type HuddleRedeemResponse,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { CheckCircle, AlertTriangle, XCircle, Users } from "lucide-react";

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
  // Huddle group codes: preview → confirm → per-member result.
  | { kind: "huddle_preview"; data: HuddleVerifyResponse; code: string }
  | { kind: "huddle_confirming"; data: HuddleVerifyResponse; code: string }
  | { kind: "huddle_result"; data: HuddleRedeemResponse; venueName: string }
  | BookingState;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function RedeemPage() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<RedeemState>({ kind: "idle" });

  async function redeem(rawCode: string) {
    const trimmed = rawCode.replace(/\D/g, "").slice(0, 6);
    if (trimmed.length < 6) return;
    setCode(trimmed);
    setState({ kind: "loading" });

    // 1) Is this a group (huddle) code? Preview it before charging.
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
      // 404 → not a huddle code; fall through to the booking path below.
    } catch {
      // network issue on the huddle probe — fall through to booking path
    }

    // 2) Otherwise treat it as a single-booking code (existing behaviour).
    try {
      const res = await bookingApi.redeem(trimmed);

      if (res.ok) {
        const data: RedeemResponse = await res.json();
        setState({ kind: "success", data });
        return;
      }

      if (res.status === 409) {
        let data: RedeemResponse | null = null;
        try {
          data = await res.json();
        } catch {
          // ignore
        }
        const redeemedAt =
          res.headers.get("X-Redeemed-At") ?? data?.redeemed_at ?? "unknown time";

        if (data?.status === "cancelled") {
          setState({ kind: "cancelled", code: trimmed });
        } else if (!data?.status) {
          const detail = (data as { detail?: string } | null)?.detail;
          setState({ kind: "error", message: detail ?? "Ticket cannot be redeemed" });
        } else {
          setState({
            kind: "already_redeemed",
            data: data!,
            redeemedAt: typeof redeemedAt === "string" ? redeemedAt : String(redeemedAt),
          });
        }
        return;
      }

      if (res.status === 404) {
        setState({ kind: "not_found", code: trimmed });
        return;
      }
      if (res.status === 403) {
        setState({ kind: "wrong_venue", code: trimmed });
        return;
      }
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    redeem(code);
  }

  function reset() {
    setState({ kind: "idle" });
    setCode("");
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Redeem ticket</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Enter the customer&apos;s 6-digit code
        </p>
      </div>

      {/* Input area */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoFocus
            className="flex-1 rounded-lg px-4 py-3 text-center font-mono text-2xl font-semibold tracking-[0.4em] focus:outline-none focus:ring-1"
            style={{ background: "var(--ph)", border: "1px solid var(--line2)", color: "var(--text)", "--tw-ring-color": "var(--accent)" } as React.CSSProperties}
            placeholder="000000"
            maxLength={6}
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={code.length < 6 || state.kind === "loading"}
            className="rounded-lg px-5 py-3 text-sm font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {state.kind === "loading" ? "Checking…" : "Redeem"}
          </button>
        </form>
      </div>

      {/* Group preview / confirm */}
      {(state.kind === "huddle_preview" || state.kind === "huddle_confirming") && (
        <HuddlePreviewCard
          data={state.data}
          confirming={state.kind === "huddle_confirming"}
          onConfirm={() => confirmHuddle(state.data, state.code)}
          onCancel={reset}
        />
      )}

      {/* Group result */}
      {state.kind === "huddle_result" && (
        <HuddleResultCard data={state.data} venueName={state.venueName} onReset={reset} />
      )}

      {/* Booking result */}
      {state.kind !== "idle" &&
        state.kind !== "loading" &&
        !state.kind.startsWith("huddle_") && (
          <ResultCard state={state as BookingState} onReset={reset} />
        )}
    </div>
  );
}

// ── Huddle: group preview with a single confirm button ────────────────────────

function HuddlePreviewCard({
  data,
  confirming,
  onConfirm,
  onCancel,
}: {
  data: HuddleVerifyResponse;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-6 space-y-4"
      style={{ background: "rgba(255,90,77,0.10)", border: "1px solid rgba(255,90,77,0.25)", color: "var(--text)" }}
    >
      <div className="flex items-start gap-4">
        <Users size={28} className="shrink-0" style={{ color: "var(--accent)" }} />
        <div className="flex-1">
          <p className="font-semibold text-lg leading-tight">Group of {data.group_size}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {data.deal_title} · {data.slot}
          </p>
        </div>
      </div>

      <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
        {data.members.map((m, i) => (
          <li key={i} className="flex items-center justify-between py-2 text-sm">
            <span className="font-medium">{m.name}</span>
            <span style={{ color: "var(--muted)" }}>{money(m.balance_cents)}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between text-sm font-semibold pt-1">
        <span>Total balance to charge</span>
        <span>{money(data.total_balance_cents)}</span>
      </div>

      <button
        onClick={onConfirm}
        disabled={confirming}
        className="w-full rounded-lg py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
        style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
      >
        {confirming ? "Charging the group…" : `Confirm & charge ${money(data.total_balance_cents)}`}
      </button>
      <button
        onClick={onCancel}
        disabled={confirming}
        className="w-full rounded-lg py-2 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{ background: "var(--chip-bg)", color: "var(--muted)" }}
      >
        Cancel
      </button>
    </div>
  );
}

// ── Huddle: per-member charge result ──────────────────────────────────────────

function HuddleResultCard({
  data,
  venueName,
  onReset,
}: {
  data: HuddleRedeemResponse;
  venueName: string;
  onReset: () => void;
}) {
  const allPaid = data.declines === 0;
  return (
    <div
      className="rounded-2xl p-6 space-y-4"
      style={
        allPaid
          ? { background: "rgba(255,90,77,0.10)", border: "1px solid rgba(255,90,77,0.25)", color: "var(--text)" }
          : { background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.25)", color: "var(--text)" }
      }
    >
      <div className="flex items-start gap-4">
        {allPaid ? (
          <CheckCircle size={28} className="shrink-0" style={{ color: "var(--accent)" }} />
        ) : (
          <AlertTriangle size={28} className="shrink-0" style={{ color: "#fbbf24" }} />
        )}
        <div className="flex-1">
          <p className="font-semibold text-lg leading-tight">
            Group redeemed{allPaid ? " — all paid" : ` — ${data.declines} to collect`}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {money(data.total_charged_cents)} charged at {venueName}.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {data.members.map((m, i) => (
          <li key={i}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{m.name}</span>
              <span style={{ color: m.status === "paid" ? "var(--muted)" : "#fbbf24" }}>
                {m.status === "paid" ? `${money(m.balance_cents)} charged` : "declined"}
              </span>
            </div>
            {m.warning && (
              <p
                className="mt-1 rounded-lg px-3 py-2 text-sm font-semibold"
                style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)" }}
              >
                {m.warning}
              </p>
            )}
          </li>
        ))}
      </ul>

      <button
        onClick={onReset}
        className="w-full rounded-lg py-2 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: "var(--chip-bg)", color: "var(--muted)" }}
      >
        Check another
      </button>
    </div>
  );
}

// ── Booking result (unchanged behaviour) ──────────────────────────────────────

function ResultCard({ state, onReset }: { state: BookingState; onReset: () => void }) {
  const isGood = state.kind === "success";
  const isWarn = state.kind === "already_redeemed" || state.kind === "cancelled";

  const cardStyle: React.CSSProperties = isGood
    ? { background: "rgba(255,90,77,0.10)", border: "1px solid rgba(255,90,77,0.25)", color: "var(--text)" }
    : isWarn
    ? { background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.25)", color: "var(--text)" }
    : { background: "rgba(244,241,234,0.04)", border: "1px solid var(--line2)", color: "var(--text)" };

  return (
    <div className="rounded-2xl p-6 space-y-4" style={cardStyle}>
      <div className="flex items-start gap-4">
        <ResultIcon kind={state.kind} />
        <div className="flex-1">
          <p className="font-semibold text-lg leading-tight">{resultTitle(state)}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{resultBody(state)}</p>

          {(state.kind === "success" || state.kind === "already_redeemed") && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt style={{ color: "var(--faint)" }}>Slot</dt>
              <dd className="font-medium">{state.data.slot_time}</dd>
              <dt style={{ color: "var(--faint)" }}>Party size</dt>
              <dd className="font-medium">{state.data.num_people}</dd>
              {state.data.balance_amount_cents != null && (
                <>
                  <dt style={{ color: "var(--faint)" }}>Balance</dt>
                  <dd className="font-medium">
                    ${(state.data.balance_amount_cents / 100).toFixed(2)}
                    {state.data.payment_status === "fully_paid" ? " — charged" : ""}
                  </dd>
                </>
              )}
            </dl>
          )}

          {state.kind === "success" && state.data.payment_warning && (
            <p
              className="mt-3 rounded-lg px-3 py-2 text-sm font-semibold"
              style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)" }}
            >
              {state.data.payment_warning}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onReset}
        className="w-full rounded-lg py-2 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: "var(--chip-bg)", color: "var(--muted)" }}
      >
        Check another
      </button>
    </div>
  );
}

function ResultIcon({ kind }: { kind: BookingState["kind"] }) {
  if (kind === "success")
    return <CheckCircle size={28} className="shrink-0" style={{ color: "var(--accent)" }} />;
  if (kind === "already_redeemed" || kind === "cancelled")
    return <AlertTriangle size={28} className="shrink-0" style={{ color: "#fbbf24" }} />;
  return <XCircle size={28} className="shrink-0" style={{ color: "var(--faint)" }} />;
}

function resultTitle(state: BookingState): string {
  switch (state.kind) {
    case "success":
      return "Valid ticket — enjoy!";
    case "already_redeemed":
      return "Already redeemed";
    case "cancelled":
      return "Booking cancelled";
    case "not_found":
      return "Code not found";
    case "wrong_venue":
      return "Wrong venue";
    case "error":
      return "Something went wrong";
  }
}

function resultBody(state: BookingState): string {
  switch (state.kind) {
    case "success":
      return `${state.data.confirmation_code} marked as attended.`;
    case "already_redeemed":
      return `This ticket was redeemed at ${formatDate(state.redeemedAt)}.`;
    case "cancelled":
      return `${state.code} belongs to a cancelled booking.`;
    case "not_found":
      return `No booking found for ${state.code}.`;
    case "wrong_venue":
      return `${state.code} belongs to a different venue.`;
    case "error":
      return state.message;
  }
}
