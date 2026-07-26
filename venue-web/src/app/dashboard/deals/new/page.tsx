"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { DealForm } from "@/components/DealForm";
import { dealApi, type DealCreate } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { FONT_DISPLAY } from "@/lib/ui";

export default function NewDealPage() {
  const { venue } = useVenue();
  const router = useRouter();
  const qc = useQueryClient();

  if (!venue) return null;

  async function handleSubmit(data: DealCreate | object) {
    await dealApi.create(data as DealCreate);
    qc.invalidateQueries({ queryKey: ["deals", venue!.id] });
    router.replace(`/dashboard/deals`);
  }

  return (
    <div style={{ padding: "38px 44px", maxWidth: 760 }}>
      <button onClick={() => router.push("/dashboard/deals")} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", marginBottom: 14, padding: 0 }}>
        ← Back to deals
      </button>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 30px" }}>New deal</h1>
      <DealForm venueId={venue.id} onSubmit={handleSubmit} submitLabel="Save deal" />
    </div>
  );
}
