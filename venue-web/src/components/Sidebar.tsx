"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useVenue } from "@/providers/VenueProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { PulseMark } from "@/components/Logo";
import { FONT_DISPLAY, FONT_MONO } from "@/lib/ui";

const NAV: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/dashboard", label: "Dashboard", match: (p) => p === "/dashboard" },
  { href: "/dashboard/deals", label: "Deals", match: (p) => p.startsWith("/dashboard/deals") },
  { href: "/dashboard/bookings", label: "Bookings", match: (p) => p.startsWith("/dashboard/bookings") },
  { href: "/dashboard/payouts", label: "Payouts", match: (p) => p.startsWith("/dashboard/payouts") },
  { href: "/dashboard/redeem", label: "Redeem", match: (p) => p.startsWith("/dashboard/redeem") },
];

export function Sidebar() {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const { venue } = useVenue();
  const { theme, toggle } = useTheme();

  return (
    <aside
      style={{
        display: "flex", flexDirection: "column", padding: "24px 18px",
        background: "var(--surface)", borderRight: "1px solid var(--line)",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 8px 20px" }}>
        <PulseMark size={30} />
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, letterSpacing: "-.02em" }}>impulse</span>
      </div>

      {/* Venue chip */}
      {venue && (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: 12, marginBottom: 22, background: "var(--surface2)", border: "1px solid var(--line)", borderRadius: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15 }}>
            {venue.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{venue.name}</div>
            {venue.suburb && (
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".08em" }}>{venue.suburb}</div>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ href, label, match }) => {
          const on = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 11,
                textAlign: "left", fontSize: 14, fontWeight: on ? 600 : 500,
                background: on ? "var(--accent-soft)" : "transparent",
                color: on ? "var(--accent)" : "var(--muted)",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: on ? "var(--accent)" : "var(--faint)" }} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer actions */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
        <button
          onClick={toggle}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, border: "none", background: "none", color: "var(--muted)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
        >
          <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--muted)", background: theme === "light" ? "var(--muted)" : "transparent" }} />
          {theme === "dark" ? "Dark" : "Light"} mode
        </button>
        <button
          onClick={() => signOut()}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, border: "none", background: "none", color: "var(--muted)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
        >
          <span style={{ fontSize: 15 }}>⏻</span> Sign out
        </button>
      </div>
    </aside>
  );
}
