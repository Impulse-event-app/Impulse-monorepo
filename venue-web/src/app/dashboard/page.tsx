"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { venueApi, type StatsResponse } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, BookOpen, DollarSign, Tag } from "lucide-react";

export default function DashboardPage() {
  const { venue, loading } = useVenue();
  const router = useRouter();

  // If venue not configured yet, send to onboarding
  if (!loading && !venue) {
    router.replace("/dashboard/onboarding");
    return null;
  }

  if (loading || !venue) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  return <DashboardContent venueId={venue.id} venueName={venue.name} />;
}

function DashboardContent({
  venueId,
  venueName,
}: {
  venueId: string;
  venueName: string;
}) {
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ["stats", venueId],
    queryFn: () => venueApi.stats(venueId),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{color:'var(--text)'}}>{venueName}</h1>
        <p className="mt-1 text-sm" style={{color:'var(--muted)'}}>Today&apos;s overview</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl" style={{background:'var(--surface)'}} />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={BookOpen}  label="Bookings today"  value={String(stats.bookings_today)} />
          <StatCard icon={DollarSign} label="Revenue today"  value={formatCurrency(stats.revenue_today)} />
          <StatCard icon={BarChart3} label="Spots filled"    value={`${stats.spots_filled} / ${stats.total_spots}`} />
          <StatCard icon={Tag}       label="Active deals"    value={String(stats.active_deals)} />
        </div>
      ) : null}

      <QuickActions />
    </div>
  );
}

type Color = "indigo" | "green" | "amber" | "purple";

const colorMap: Record<Color, string> = {
  indigo: "bg-indigo-50 text-indigo-600",
  green: "bg-green-50 text-green-600",
  amber: "bg-amber-50 text-amber-600",
  purple: "bg-purple-50 text-purple-600",
};

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl p-5" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
      <div className="inline-flex rounded-xl p-2.5" style={{background:'var(--accent-soft)'}}>
        <Icon size={18} style={{color:'var(--accent)'}} />
      </div>
      <p className="mt-3 text-2xl font-bold" style={{color:'var(--text)'}}>{value}</p>
      <p className="mt-0.5 text-xs" style={{color:'var(--muted)'}}>{label}</p>
    </div>
  );
}

function QuickActions() {
  const router = useRouter();
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{color:'var(--faint)'}}>
        Quick actions
      </h2>
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => router.push("/dashboard/deals/new")}
          className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{background:'var(--accent)', color:'var(--accent-ink)'}}
        >
          + New deal
        </button>
        <button
          onClick={() => router.push("/dashboard/redeem")}
          className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface2"
          style={{background:'var(--surface)', color:'var(--text)', border:'1px solid var(--line2)'}}
        >
          Redeem ticket
        </button>
      </div>
    </div>
  );
}
