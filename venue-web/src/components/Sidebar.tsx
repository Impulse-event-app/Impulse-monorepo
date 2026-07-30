"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useVenue } from "@/providers/VenueProvider";
import type { Venue } from "@/lib/api";
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
  const { venue, venues, selectVenue } = useVenue();
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

      {/* Venue chip — becomes a switcher when the owner has more than one */}
      {venue && <VenueSwitcher venue={venue} venues={venues} onSelect={selectVenue} />}

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

const chipShell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  width: "100%",
  padding: 12,
  background: "var(--surface2)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  color: "var(--text)",
  textAlign: "left",
};

function VenueInitial({ name }: { name: string }) {
  return (
    <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function VenueSwitcher({
  venue,
  venues,
  onSelect,
}: {
  venue: Venue;
  venues: Venue[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — the panel overlays the nav beneath it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A single venue needs no picker — keep the original static chip.
  if (venues.length < 2) {
    return (
      <div style={{ ...chipShell, marginBottom: 22 }}>
        <VenueInitial name={venue.name} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{venue.name}</div>
          {venue.suburb && (
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".08em" }}>{venue.suburb}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative", marginBottom: 22 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ ...chipShell, cursor: "pointer", borderColor: open ? "var(--accent)" : "var(--line)" }}
      >
        <VenueInitial name={venue.name} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{venue.name}</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".08em" }}>
            {venue.suburb ?? `${venues.length} venues`}
          </div>
        </div>
        <span style={{ color: "var(--faint)", fontSize: 10, transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>▼</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30, padding: 6, background: "var(--surface)", border: "1px solid var(--line2)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,.28)", maxHeight: 320, overflowY: "auto" }}
        >
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)", padding: "7px 10px 8px" }}>
            Switch venue
          </div>
          {venues.map((v) => {
            const on = v.id === venue.id;
            return (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => { onSelect(v.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer", textAlign: "left", background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent)" : "var(--text)" }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: on ? "var(--accent)" : "var(--line2)" }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: on ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {v.name}
                </span>
                {v.suburb && (
                  <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".08em", flexShrink: 0 }}>{v.suburb}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
