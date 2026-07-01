"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { Sidebar } from "@/components/Sidebar";
import { VenueProvider } from "@/providers/VenueProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <VenueProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6" style={{background:'var(--bg)'}}>
            {children}
          </main>
        </div>
      </VenueProvider>
    </RequireAuth>
  );
}
