"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  LogOut,
  QrCode,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useVenue } from "@/providers/VenueProvider";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/dashboard/deals", label: "Deals", icon: Tag },
  { href: "/dashboard/bookings", label: "Bookings", icon: BookOpen },
  { href: "/dashboard/redeem", label: "Redeem", icon: QrCode },
];

export function Sidebar() {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const { venue } = useVenue();

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-surface" style={{borderColor:'var(--line)'}}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="text-xl font-bold" style={{color:'var(--accent)'}}>Impulse</span>
      </div>

      {/* Venue name */}
      {venue && (
        <div className="mx-3 mb-2 rounded-lg px-3 py-2" style={{background:'var(--accent-soft)'}}>
          <p className="text-xs font-medium uppercase tracking-wider" style={{color:'var(--accent)'}}>Venue</p>
          <p className="mt-0.5 truncate text-sm font-semibold" style={{color:'var(--text)'}}>
            {venue.name}
          </p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              )}
              style={active
                ? {background:'var(--accent-soft)', color:'var(--accent)'}
                : {color:'var(--muted)'}}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-2 py-3" style={{borderTop:'1px solid var(--line)'}}>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-surface2"
          style={{color:'var(--faint)'}}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
