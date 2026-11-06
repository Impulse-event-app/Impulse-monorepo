"use client";

import { ConnectAccountOnboarding, ConnectNotificationBanner } from "@stripe/react-connect-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { StripeConnect } from "@/components/StripeConnect";
import { StripeDashboardButton } from "@/components/StripeDashboardButton";
import { ApiError, merchantApi, type PaymentsStatus } from "@/lib/api";
import { FONT_DISPLAY, btnPrimary, card, eyebrow, fieldLabel, toneBadge, type Tone } from "@/lib/ui";
import { useVenue } from "@/providers/VenueProvider";

const STATUS: Record<string, { label: string; tone: Tone; copy: string }> = {
  active: {
    label: "Verified",
    tone: "good",
    copy: "You're set up. When you check a group in, their payment lands in your bank within minutes.",
  },
  pending: {
    label: "Being verified",
    tone: "info",
    copy: "Stripe is checking your details, which usually takes a few minutes. You can draft deals in the meantime; they go live once you're verified.",
  },
  unfinished: {
    label: "Not finished",
    tone: "info",
    copy: "Finish Stripe's steps below and you can start taking bookings.",
  },
  restricted: {
    label: "Needs attention",
    tone: "danger",
    copy: "Stripe needs something checked or added before you can take bookings. Finish the steps below.",
  },
};

function pilotLine(status: PaymentsStatus): string | null {
  if (!status.pilot_ends_at) return null;
  const ends = new Date(status.pilot_ends_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  return status.in_pilot
    ? `Free pilot until ${ends}: you keep 100% of every booking, and Impulse covers the card and payout fees.`
    : `Your free pilot ended on ${ends}. Impulse keeps the 10% deposit on each booking; the rest is yours.`;
}

export default function PaymentsSetupPage() {
  const { venue, loading } = useVenue();
  const qc = useQueryClient();
  const venueId = venue?.id ?? "";

  const { data: status } = useQuery<PaymentsStatus>({
    queryKey: ["merchant-status", venueId],
    queryFn: () => merchantApi.status(venueId),
    enabled: !!venueId,
  });

  const start = useMutation({
    mutationFn: () => merchantApi.create(venueId),
    onSuccess: (s) => qc.setQueryData(["merchant-status", venueId], s),
  });

  if (loading || !venue) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }

  // "restricted" covers both a venue that simply hasn't finished onboarding and
  // one Stripe has flagged; only the second is worth an alarming badge.
  const key = status?.transfers_status === "restricted" && !status.needs_attention
    ? "unfinished"
    : status?.transfers_status ?? "";
  const meta = STATUS[key] ?? STATUS.pending;
  const { badge, dot } = toneBadge(meta.tone);
  const pilot = status ? pilotLine(status) : null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["merchant-status", venueId] });

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "38px 44px 80px" }}>
      <div style={{ ...eyebrow, marginBottom: 8 }}>Payments setup</div>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 6px" }}>
        Get paid at the door
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 26px", maxWidth: 640, lineHeight: 1.6 }}>
        Guests&apos; cards are held when they book and charged when you check them in with their code.
        The money reaches your bank within minutes. Stripe, our payments provider, verifies your
        business once. It takes about five minutes.
      </p>

      {status?.stripe_account_id && (
        <div style={{ ...card, padding: 22, marginBottom: 22 }}>
          <span style={badge}>
            <span style={dot} />
            {meta.label}
          </span>
          <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "14px 0 0", lineHeight: 1.6 }}>{meta.copy}</p>
          {pilot && <p style={{ fontSize: 13.5, margin: "10px 0 0", lineHeight: 1.6 }}>{pilot}</p>}
          {status.transfers_status === "active" && (
            <div style={{ marginTop: 16 }}>
              <StripeDashboardButton venueId={venueId} />
            </div>
          )}
          {status.outstanding.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...fieldLabel, marginBottom: 8 }}>Still needed</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.8 }}>
                {status.outstanding.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {status && !status.stripe_account_id && (
        <div style={{ ...card, padding: 26 }}>
          <p style={{ fontSize: 14, margin: "0 0 18px", lineHeight: 1.6 }}>
            You&apos;ll need your ABN, your business address, your website (a social media page is
            fine) and the bank account your payouts should go to. Stripe may ask for photo ID if it
            needs to confirm who you are.
          </p>
          <button onClick={() => start.mutate()} disabled={start.isPending} style={{ ...btnPrimary, padding: "12px 22px" }}>
            {start.isPending ? "Starting…" : "Set up payments →"}
          </button>
          {start.error && (
            <p style={{ color: "var(--bad)", fontSize: 13, margin: "12px 0 0" }}>
              {start.error instanceof ApiError ? start.error.message : "Couldn't start payments setup. Try again."}
            </p>
          )}
        </div>
      )}

      {status?.stripe_account_id && (
        <StripeConnect key={venueId} venueId={venueId}>
          <div style={{ marginBottom: 18 }}>
            <ConnectNotificationBanner />
          </div>
          {status.transfers_status !== "active" && (
            <div style={{ ...card, padding: 22 }}>
              <ConnectAccountOnboarding onExit={refresh} onStepChange={refresh} />
            </div>
          )}
        </StripeConnect>
      )}
    </div>
  );
}
