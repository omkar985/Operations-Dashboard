"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { SessionUser } from "@/lib/auth/session";
import type { Freshness } from "@/server/services/dataset-service";

interface DashboardShellProps {
  user: SessionUser;
  freshness: Freshness;
  children: React.ReactNode;
}

export function DashboardShell({ user, freshness, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="shell page-mesh">
      <Sidebar
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-col min-w-0 flex-1">
        <Topbar
          freshness={freshness}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main id="main-content" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
