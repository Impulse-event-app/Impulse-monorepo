"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dealApi, venueApi, type Deal } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency } from "@/lib/utils";
import { Pencil, Trash2, BookOpen } from "lucide-react";

export default function DealsPage() {
  const { venue } = useVenue();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["deals", venue?.id],
    queryFn: () => venueApi.deals(venue!.id),
    enabled: !!venue,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      dealApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals", venue?.id] }),
  });

  const deleteDeal = useMutation({
    mutationFn: (id: string) => dealApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals", venue?.id] }),
  });

  function confirmDelete(deal: Deal) {
    if (confirm(`Delete "${deal.title}"? This cannot be undone.`)) {
      deleteDeal.mutate(deal.id);
    }
  }

  if (!venue) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{color:'var(--text)'}}>Deals</h1>
          <p className="mt-1 text-sm" style={{color:'var(--muted)'}}>Manage your discounted slots</p>
        </div>
        <Link
          href="/dashboard/deals/new"
          className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{background:'var(--accent)', color:'var(--accent-ink)'}}
        >
          + New deal
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl" style={{background:'var(--surface)'}} />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
          <p style={{color:'var(--muted)'}}>No deals yet.</p>
          <Link
            href="/dashboard/deals/new"
            className="mt-4 inline-block text-sm font-medium hover:underline"
            style={{color:'var(--accent)'}}
          >
            Create your first deal →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider" style={{borderBottom:'1px solid var(--line)', background:'var(--surface2)', color:'var(--faint)'}}>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Spots</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id} className="transition-colors hover:bg-surface2" style={{borderBottom:'1px solid var(--line)'}}>
                  <td className="px-4 py-3 font-medium" style={{color:'var(--text)'}}>
                    {deal.title}
                    <span className="ml-2 rounded px-1.5 py-0.5 text-xs" style={{background:'var(--chip-bg)', color:'var(--faint)'}}>
                      {deal.category}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{color:'var(--muted)'}}>{deal.date}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold" style={{color:'var(--accent)'}}>
                      {formatCurrency(deal.deal_price)}
                    </span>
                    {deal.unit && <span style={{color:'var(--faint)'}}> {deal.unit}</span>}
                    <span className="ml-1 text-xs line-through" style={{color:'var(--faint)'}}>
                      {formatCurrency(deal.original_price)}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{color:'var(--muted)'}}>
                    {deal.spots_remaining}/{deal.total_spots}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive.mutate({ id: deal.id, is_active: !deal.is_active })}
                      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                      style={{background: deal.is_active ? 'var(--accent)' : 'var(--ph)'}}
                    >
                      <span
                        className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                        style={{transform: deal.is_active ? 'translateX(1rem)' : 'translateX(0.125rem)'}}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/dashboard/bookings?deal_id=${deal.id}`)}
                        className="transition-colors hover:text-accent"
                        style={{color:'var(--faint)'}}
                        title="View bookings"
                      >
                        <BookOpen size={15} />
                      </button>
                      <Link
                        href={`/dashboard/deals/${deal.id}/edit`}
                        className="transition-colors"
                        style={{color:'var(--faint)'}}
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        onClick={() => confirmDelete(deal)}
                        className="transition-colors"
                        style={{color:'var(--faint)'}}
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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
