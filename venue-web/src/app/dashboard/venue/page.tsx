"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { VenueForm } from "@/components/VenueForm";
import { venueApi, type Venue, type VenueCreate, type VenueUpdate } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useVenue } from "@/providers/VenueProvider";
import { FONT_DISPLAY } from "@/lib/ui";

// Optional fields a venue can empty. They go up as null: PATCH only applies
// keys that are present, so leaving them out would keep the old value.
const CLEARABLE = ["description", "phone", "email", "website", "image_url"] as const;

export default function VenueDetailsPage() {
  const { user } = useAuth();
  const { venue } = useVenue();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  if (!venue) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }

  const handleSubmit = async (payload: VenueCreate) => {
    setSaved(false);
    const body: VenueUpdate = { ...payload };
    for (const key of CLEARABLE) {
      if (!payload[key]?.trim()) body[key] = null;
    }
    const updated = await venueApi.update(venue.id, body);
    // Swap the saved venue into the cached list so the sidebar chip and every
    // other screen show the new details without waiting on a refetch.
    qc.setQueryData<Venue[]>(["my-venues", user?.id], (list) =>
      list?.map((v) => (v.id === updated.id ? updated : v))
    );
    setSaved(true);
  };

  return (
    <div style={{ padding: "38px 44px 80px", maxWidth: 840 }}>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 8px" }}>Venue details</h1>
      <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 10px", maxWidth: 560 }}>This is what guests see when your deals surface. Changes show in the app as soon as you save.</p>
      {saved && (
        <p role="status" style={{ borderRadius: 12, padding: "12px 16px", margin: "16px 0 8px", fontSize: 13, fontWeight: 600, background: "color-mix(in oklab, var(--good) 12%, transparent)", color: "var(--good)" }}>
          Venue details saved.
        </p>
      )}
      {/* Keyed so switching venue in the sidebar reloads the form. */}
      <VenueForm key={venue.id} initial={venue} submitLabel="Save changes" savingLabel="Saving…" onSubmit={handleSubmit} />
    </div>
  );
}
