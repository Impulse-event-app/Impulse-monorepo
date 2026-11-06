"use client";

import { useState } from "react";

import { ApiError, merchantApi } from "@/lib/api";
import { btnGhost } from "@/lib/ui";

/** Opens the venue's Stripe Express Dashboard (payouts, disputes) in a new tab.
 *  Stripe's login links are single-use and expire quickly, so a fresh one is
 *  fetched on every click. The tab is opened before the request so popup
 *  blockers treat it as the user's click. */
export function StripeDashboardButton({ venueId }: { venueId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const tab = window.open("", "_blank");
    try {
      const { url } = await merchantApi.dashboardLink(venueId);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      setError(e instanceof ApiError ? e.message : "Couldn't open your Stripe dashboard. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={open} disabled={busy} style={{ ...btnGhost, padding: "10px 16px", fontSize: 13.5 }}>
        {busy ? "Opening…" : "Open Stripe dashboard ↗"}
      </button>
      {error && <p style={{ color: "var(--bad)", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
