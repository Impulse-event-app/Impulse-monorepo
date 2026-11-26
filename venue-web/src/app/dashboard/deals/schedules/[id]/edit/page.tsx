"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { NewDealComposer } from "@/components/NewDealComposer";
import { scheduleApi, type DealSchedule } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";

export default function EditSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const { venue } = useVenue();
  const { data: schedule, isLoading } = useQuery<DealSchedule>({
    queryKey: ["schedule", id],
    queryFn: () => scheduleApi.get(id),
    enabled: !!id,
  });

  if (isLoading || !schedule || !venue) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }
  // Changes apply from the next evening it runs; tonight's deal is edited on its own.
  return <NewDealComposer key={schedule.id} venue={venue} editSchedule={schedule} />;
}
