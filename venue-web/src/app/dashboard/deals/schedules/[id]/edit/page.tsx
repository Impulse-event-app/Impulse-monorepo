"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { DealForm, type DealSubmission } from "@/components/DealForm";
import { scheduleApi, type DealSchedule, type DealScheduleInput } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { FONT_DISPLAY } from "@/lib/ui";

export default function EditSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const { venue } = useVenue();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: schedule, isLoading } = useQuery<DealSchedule>({
    queryKey: ["schedule", id],
    queryFn: () => scheduleApi.get(id),
    enabled: !!id,
  });

  async function handleSubmit(s: DealSubmission) {
    await scheduleApi.update(id, s.data as DealScheduleInput);
    qc.invalidateQueries({ queryKey: ["schedules", venue?.id] });
    qc.invalidateQueries({ queryKey: ["schedule", id] });
    qc.invalidateQueries({ queryKey: ["deals", venue?.id] });
    router.push("/dashboard/deals");
  }

  if (isLoading || !schedule || !venue) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }

  return (
    <div style={{ padding: "38px 44px", maxWidth: 760 }}>
      <button onClick={() => router.push("/dashboard/deals")} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", marginBottom: 14, padding: 0 }}>
        ← Back to deals
      </button>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 8px" }}>Edit weekly deal</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 30px" }}>
        Changes apply from the next day it runs. A deal already live tonight is edited from the deals list.
      </p>
      <DealForm venueId={venue.id} initialSchedule={schedule} onSubmit={handleSubmit} submitLabel="Save weekly deal" />
    </div>
  );
}
