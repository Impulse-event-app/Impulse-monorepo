"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NewDealComposer } from "@/components/NewDealComposer";
import { useVenue } from "@/providers/VenueProvider";

export default function NewDealPage() {
  const { venue } = useVenue();
  const qc = useQueryClient();

  // The composer navigates to Deals on save; leaving for any reason refreshes
  // the lists it may have added to. A schedule that runs today makes tonight's
  // deal straight away, so both go.
  useEffect(() => {
    if (!venue) return;
    return () => {
      qc.invalidateQueries({ queryKey: ["deals", venue.id] });
      qc.invalidateQueries({ queryKey: ["schedules", venue.id] });
    };
  }, [venue, qc]);

  if (!venue) return null;

  return <NewDealComposer venue={venue} />;
}
