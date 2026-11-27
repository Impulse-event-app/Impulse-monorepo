"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { NewDealComposer } from "@/components/NewDealComposer";
import { dealApi, type Deal } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";

export default function EditDealPage() {
  const { id } = useParams<{ id: string }>();
  const { venue } = useVenue();
  const { data: deal, isLoading } = useQuery<Deal>({
    queryKey: ["deal", id],
    queryFn: () => dealApi.get(id),
    enabled: !!id,
  });

  if (isLoading || !deal || !venue) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }
  // Keyed by id so moving between deals starts from each one's saved values.
  return <NewDealComposer key={deal.id} venue={venue} editDeal={deal} />;
}
