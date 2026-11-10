"use client";

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
          <div style={{ display: "grid", gridTemplateColumns: "250px 1fr", minHeight: "100vh", background: "var(--bg)" }}>
            <Sidebar />
            {/* position: relative makes main the containing block for absolutely
                positioned descendants (e.g. visually-hidden labels). Without it they
                resolve against the page, escape main's scroll clip and let the whole
                window scroll past the content. */}
            <main className="app-scroll" style={{ position: "relative", maxHeight: "100vh", overflowY: "auto" }}>
              {children}
            </main>
          </div>
        )}
      </VenueProvider>
    </RequireAuth>
  );
}
