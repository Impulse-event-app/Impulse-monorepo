"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { DealForm } from "@/components/DealForm";
import { dealApi, type DealCreate } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";

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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New deal</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a discounted slot for {venue.name}
        </p>
      </div>
      <DealForm venueId={venue.id} onSubmit={handleSubmit} submitLabel="Create deal" />
    </div>
  );
}
