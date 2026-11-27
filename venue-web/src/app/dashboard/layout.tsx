"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { Sidebar } from "@/components/Sidebar";
import { VenueProvider } from "@/providers/VenueProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The sidebar folds down to an icon rail; the choice sticks between visits.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // Read after mount so the server render and the first client render match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);
  function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  }
  // Onboarding is a full-bleed first-run flow — no sidebar chrome.
  const fullBleed = pathname === "/dashboard/onboarding";

  return (
    <RequireAuth>
      <VenueProvider>
        {fullBleed ? (
          <div className="app-scroll" style={{ minHeight: "100vh", overflowY: "auto", background: "var(--bg)" }}>
            {children}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `${collapsed ? 76 : 250}px 1fr`, minHeight: "100vh", background: "var(--bg)", transition: "grid-template-columns .32s cubic-bezier(.32,.72,0,1)" }}>
            <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
            <main className="app-scroll" style={{ position: "relative", maxHeight: "100vh", overflowY: "auto" }}>
              {children}
            </main>
          </div>
        )}
      </VenueProvider>
    </RequireAuth>
  );
}
