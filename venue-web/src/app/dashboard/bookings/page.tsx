"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { bookingApi, venueApi, type Booking, type Deal } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">Loading…</div>}>
      <BookingsContent />
    </Suspense>
  );
}

function BookingsContent() {
  const { venue } = useVenue();
  const searchParams = useSearchParams();
  const dealId = searchParams.get("deal_id");

  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ["deals", venue?.id],
    queryFn: () => venueApi.deals(venue!.id),
    enabled: !!venue,
  });

  const selectedDealId = dealId ?? deals[0]?.id ?? null;

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["bookings", selectedDealId],
    queryFn: () => bookingApi.listForDeal(selectedDealId!),
    enabled: !!selectedDealId,
  });

  if (!venue) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{color:'var(--text)'}}>Bookings</h1>
        <p className="mt-1 text-sm" style={{color:'var(--muted)'}}>Who&apos;s coming</p>
      </div>

      {/* Deal picker */}
      {deals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {deals.map((d) => (
            <Link
              key={d.id}
              href={`/dashboard/bookings?deal_id=${d.id}`}
              className="rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
              style={d.id === selectedDealId
                ? {background:'var(--accent)', color:'var(--accent-ink)'}
                : {background:'var(--surface)', color:'var(--muted)', border:'1px solid var(--line2)'}}
            >
              {d.title}
            </Link>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl" style={{background:'var(--surface)'}} />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
          <p style={{color:'var(--muted)'}}>No bookings for this deal yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider"
                style={{borderBottom:'1px solid var(--line)', background:'var(--surface2)', color:'var(--faint)'}}>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Slot</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Redeemed at</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} style={{borderBottom:'1px solid var(--line)'}}>
                  <td className="px-4 py-3 font-mono font-semibold" style={{color:'var(--accent)'}}>
                    {b.confirmation_code}
                  </td>
                  <td className="px-4 py-3" style={{color:'var(--muted)'}}>{b.slot_time}</td>
                  <td className="px-4 py-3" style={{color:'var(--muted)'}}>
                    {b.num_people} {b.num_people === 1 ? 'person' : 'people'}
                  </td>
                  <td className="px-4 py-3" style={{color:'var(--text)'}}>{formatCurrency(b.total_paid)}</td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-3 text-xs" style={{color:'var(--faint)'}}>
                    {b.redeemed_at ? formatDate(b.redeemed_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Booking["status"] }) {
  const styles: Record<Booking["status"], React.CSSProperties> = {
    confirmed: {background:'rgba(59,130,246,0.12)', color:'#60a5fa'},
    attended:  {background:'rgba(255,90,77,0.12)',  color:'var(--accent)'},
    cancelled: {background:'rgba(244,241,234,0.07)', color:'var(--faint)'},
    pending:   {background:'rgba(244,241,234,0.07)', color:'var(--faint)'},
  };
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize"
      style={styles[status]}>
      {status}
    </span>
  );
}
