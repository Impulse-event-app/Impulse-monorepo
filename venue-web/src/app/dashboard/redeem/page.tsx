"use client";

import { useState } from "react";
import { bookingApi, type RedeemResponse } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

type RedeemState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: RedeemResponse }
  | { kind: "already_redeemed"; data: RedeemResponse; redeemedAt: string }
  | { kind: "cancelled"; code: string }
  | { kind: "not_found"; code: string }
  | { kind: "wrong_venue"; code: string }
  | { kind: "error"; message: string };

export default function RedeemPage() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<RedeemState>({ kind: "idle" });

  async function redeem(rawCode: string) {
    const trimmed = rawCode.replace(/\D/g, "").slice(0, 6);
    if (trimmed.length < 6) return;
    setCode(trimmed);
    setState({ kind: "loading" });

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
          res.headers.get("X-Redeemed-At") ??
          data?.redeemed_at ??
          "unknown time";

        if (data?.status === "cancelled") {
          setState({ kind: "cancelled", code: trimmed });
        } else if (!data?.status) {
          // 409 without a booking payload — e.g. deposit not paid
          const detail = (data as { detail?: string } | null)?.detail;
          setState({ kind: "error", message: detail ?? "Ticket cannot be redeemed" });
        } else {
          setState({
            kind: "already_redeemed",
            data: data!,
            redeemedAt:
              typeof redeemedAt === "string" ? redeemedAt : String(redeemedAt),
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
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
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
        <h1 className="text-2xl font-bold" style={{color:'var(--text)'}}>Redeem ticket</h1>
        <p className="mt-1 text-sm" style={{color:'var(--muted)'}}>
          Enter the customer&apos;s 6-digit code
        </p>
      </div>

      {/* Input area */}
      <div className="rounded-2xl p-6 space-y-4" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoFocus
            className="flex-1 rounded-lg px-4 py-3 text-center font-mono text-2xl font-semibold tracking-[0.4em] focus:outline-none focus:ring-1"
            style={{background:'var(--ph)', border:'1px solid var(--line2)', color:'var(--text)', '--tw-ring-color':'var(--accent)'} as React.CSSProperties}
            placeholder="000000"
            maxLength={6}
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={code.length < 6 || state.kind === "loading"}
            className="rounded-lg px-5 py-3 text-sm font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{background:'var(--accent)', color:'var(--accent-ink)'}}
          >
            {state.kind === "loading" ? "Checking…" : "Redeem"}
          </button>
        </form>
      </div>

      {/* Result */}
      {state.kind !== "idle" && state.kind !== "loading" && (
        <ResultCard state={state} onReset={reset} />
      )}
    </div>
  );
}

function ResultCard({
  state,
  onReset,
}: {
  state: Exclude<RedeemState, { kind: "idle" } | { kind: "loading" }>;
  onReset: () => void;
}) {
  const isGood = state.kind === "success";
  const isWarn = state.kind === "already_redeemed" || state.kind === "cancelled";

  const cardStyle: React.CSSProperties = isGood
    ? {background:'rgba(255,90,77,0.10)', border:'1px solid rgba(255,90,77,0.25)', color:'var(--text)'}
    : isWarn
    ? {background:'rgba(251,191,36,0.10)', border:'1px solid rgba(251,191,36,0.25)', color:'var(--text)'}
    : {background:'rgba(244,241,234,0.04)', border:'1px solid var(--line2)', color:'var(--text)'};

  return (
    <div className="rounded-2xl p-6 space-y-4" style={cardStyle}>
      <div className="flex items-start gap-4">
        <ResultIcon kind={state.kind} />
        <div className="flex-1">
          <p className="font-semibold text-lg leading-tight">{resultTitle(state)}</p>
          <p className="mt-1 text-sm" style={{color:'var(--muted)'}}>{resultBody(state)}</p>

          {(state.kind === "success" || state.kind === "already_redeemed") && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt style={{color:'var(--faint)'}}>Slot</dt>
              <dd className="font-medium">{state.data.slot_time}</dd>
              <dt style={{color:'var(--faint)'}}>Party size</dt>
              <dd className="font-medium">{state.data.num_people}</dd>
              {state.data.balance_amount_cents != null && (
                <>
                  <dt style={{color:'var(--faint)'}}>Balance</dt>
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
              style={{background:'rgba(251,191,36,0.15)', border:'1px solid rgba(251,191,36,0.35)'}}
            >
              {state.data.payment_warning}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onReset}
        className="w-full rounded-lg py-2 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{background:'var(--chip-bg)', color:'var(--muted)'}}
      >
        Check another
      </button>
    </div>
  );
}

function ResultIcon({ kind }: { kind: RedeemState["kind"] }) {
  if (kind === "success")
    return <CheckCircle size={28} className="shrink-0" style={{color:'var(--accent)'}} />;
  if (kind === "already_redeemed" || kind === "cancelled")
    return <AlertTriangle size={28} className="shrink-0" style={{color:'#fbbf24'}} />;
  return <XCircle size={28} className="shrink-0" style={{color:'var(--faint)'}} />;
}

function resultTitle(
  state: Exclude<RedeemState, { kind: "idle" } | { kind: "loading" }>
): string {
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

function resultBody(
  state: Exclude<RedeemState, { kind: "idle" } | { kind: "loading" }>
): string {
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
