"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { DealForm } from "@/components/DealForm";
import { dealApi, type Deal, type DealUpdate } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";

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
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit deal</h1>
        <p className="mt-1 text-sm text-gray-500">{deal.title}</p>
      </div>
      <DealForm
        venueId={venue.id}
        initial={deal}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
      />
    </div>
  );
}
