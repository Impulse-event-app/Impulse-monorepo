"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { DealForm } from "@/components/DealForm";
import { dealApi, type Deal, type DealUpdate } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { FONT_DISPLAY } from "@/lib/ui";

export default function EditDealPage() {
  const { id } = useParams<{ id: string }>();
  const { venue } = useVenue();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: deal, isLoading } = useQuery<Deal>({
    queryKey: ["deal", id],
    queryFn: () => dealApi.get(id),
    enabled: !!id,
  });

  async function handleSubmit(data: object) {
    await dealApi.update(id, data as DealUpdate);
    qc.invalidateQueries({ queryKey: ["deals", venue?.id] });
    qc.invalidateQueries({ queryKey: ["deal", id] });
    router.push("/dashboard/deals");
  }

  if (isLoading || !deal || !venue) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }

  return (
    <div style={{ padding: "38px 44px", maxWidth: 760 }}>
      <button onClick={() => router.push("/dashboard/deals")} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", marginBottom: 14, padding: 0 }}>
        ← Back to deals
      </button>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 30px" }}>Edit deal</h1>
      <DealForm venueId={venue.id} initial={deal} onSubmit={handleSubmit} submitLabel="Save deal" />
    </div>
  );
}
