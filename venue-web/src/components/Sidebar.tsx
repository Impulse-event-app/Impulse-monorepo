"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useVenue } from "@/providers/VenueProvider";
import type { Venue } from "@/lib/api";
import { useTheme } from "@/providers/ThemeProvider";
import { PulseMark } from "@/components/Logo";
import { FONT_DISPLAY, numeric } from "@/lib/ui";
import {
  CalendarCheck, CreditCard, KeyRound, LayoutDashboard, LogOut, Moon, PanelLeftClose, ScanLine, Store, Sun, Tag,
  type LucideIcon,
} from "lucide-react";

const NAV: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
  { href: "/dashboard/venue", label: "Venue details", icon: Store, match: (p) => p === "/dashboard/venue" },
  { href: "/dashboard/deals", label: "Deals", icon: Tag, match: (p) => p.startsWith("/dashboard/deals") },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheck, match: (p) => p.startsWith("/dashboard/bookings") },
  { href: "/dashboard/payments-setup", label: "Payments setup", icon: CreditCard, match: (p) => p.startsWith("/dashboard/payments-setup") },
  { href: "/dashboard/redeem", label: "Redeem", icon: ScanLine, match: (p) => p.startsWith("/dashboard/redeem") },
];

const EASE = "cubic-bezier(.32,.72,0,1)";

/** Labels fade out as the sidebar folds; the icons stay put. */
function Label({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  return (
    <span style={{ whiteSpace: "nowrap", overflow: "hidden", opacity: hidden ? 0 : 1, transition: `opacity ${hidden ? ".12s" : ".28s .08s"} ease` }}>
      {children}
    </span>
  );
}

const footerRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "10px 11px", borderRadius: 10, border: "none", background: "none",
  color: "var(--muted)", fontSize: 13, fontWeight: 500, cursor: "pointer", width: "100%", textAlign: "left",
};

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const { venue, venues, selectVenue } = useVenue();
  const { theme, toggle } = useTheme();

  return (
    <aside
      style={{
        position: "sticky", top: 0, height: "100vh", boxSizing: "border-box", overflow: "hidden",
        display: "flex", flexDirection: "column", padding: "24px 18px",
        background: "var(--surface)", borderRight: "1px solid var(--line)",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 5px 20px" }}>
        <span style={{ flexShrink: 0 }}><PulseMark size={30} /></span>
        <Label hidden={collapsed}>
          <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, letterSpacing: "-.02em" }}>impulse</span>
        </Label>
      </div>

      {/* Venue chip — becomes a switcher when the owner has more than one */}
      {venue && (collapsed ? (
        <div title={venue.name} style={{ display: "flex", justifyContent: "center", padding: "3px 0", marginBottom: 22 }}>
          <VenueInitial name={venue.name} />
        </div>
      ) : (
        <VenueSwitcher venue={venue} venues={venues} onSelect={selectVenue} />
      ))}

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const on = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              aria-current={on ? "page" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 11px", borderRadius: 11,
                textAlign: "left", fontSize: 14, fontWeight: on ? 600 : 500,
                background: on ? "var(--accent-soft)" : "transparent",
                color: on ? "var(--accent)" : "var(--muted)",
                transition: "background-color .15s ease, color .15s ease",
              }}
            >
              <Icon size={18} strokeWidth={on ? 2.2 : 1.8} style={{ flexShrink: 0 }} aria-hidden />
              <Label hidden={collapsed}>{label}</Label>
            </Link>
          );
        })}
      </nav>

      {/* Footer actions */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 4, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <button onClick={toggle} title={collapsed ? `${theme === "dark" ? "Dark" : "Light"} mode` : undefined} style={footerRow}>
          {theme === "dark" ? <Moon size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden /> : <Sun size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden />}
          <Label hidden={collapsed}>{theme === "dark" ? "Dark" : "Light"} mode</Label>
        </button>
        <Link href="/reset-password" title={collapsed ? "Change password" : undefined} style={footerRow}>
          <KeyRound size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden />
          <Label hidden={collapsed}>Change password</Label>
        </Link>
        <button onClick={() => signOut()} title={collapsed ? "Sign out" : undefined} style={footerRow}>
          <LogOut size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden />
          <Label hidden={collapsed}>Sign out</Label>
        </button>
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : undefined}
          style={{ ...footerRow, marginTop: 6 }}
        >
          <PanelLeftClose
            size={17}
            strokeWidth={1.8}
            aria-hidden
            style={{ flexShrink: 0, transform: collapsed ? "rotate(180deg)" : "none", transition: `transform .32s ${EASE}` }}
          />
          <Label hidden={collapsed}>Collapse</Label>
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
    <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15 }}>
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
            <div style={{ ...numeric, fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".08em" }}>{venue.suburb}</div>
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
          <div style={{ ...numeric, fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".08em" }}>
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
          <div style={{ ...numeric, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)", padding: "7px 10px 8px" }}>
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
                  <span style={{ ...numeric, fontSize: 9.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".08em", flexShrink: 0 }}>{v.suburb}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
