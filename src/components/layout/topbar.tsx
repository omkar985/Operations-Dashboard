"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, RefreshCw } from "lucide-react";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useToast } from "@/components/providers/toast-provider";
import type { Freshness } from "@/server/services/dataset-service";

interface TopbarProps {
  freshness: Freshness;
  onMenuClick: () => void;
}

function formatAge(ageSeconds: number | null): string {
  if (ageSeconds === null) return "Never synced";
  if (ageSeconds < 60) return "Just now";
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Topbar({ freshness, onMenuClick }: TopbarProps) {
  const router = useRouter();
  const toast = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);

    try {
      const res = await fetch("/api/data/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success(
          "Data Refreshed",
          body.data?.recordCount !== undefined
            ? `Successfully synchronized ${body.data.recordCount.toLocaleString()} operational records.`
            : "Operations ledger synchronized from Google Sheets."
        );
        router.refresh();
      } else if (res.status === 409) {
        toast.info("Sync In Progress", "A background sync is already executing.");
      } else {
        toast.error(
          "Sync Failed",
          body.error?.message || "Failed to trigger synchronization with Google Sheets."
        );
      }
    } catch {
      toast.error("Network Error", "Unable to contact the synchronization service.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const isRunning = freshness.lastRunStatus === "running" || isRefreshing;
  const isStale = freshness.stale;
  const hasError = freshness.lastError !== null;

  return (
    <header className="topbar">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon lg:hidden -ml-2 text-[var(--ink)]"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Live System Indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md transition-all ${
              !freshness.configured
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                : isRunning
                ? "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30 shadow-[0_0_14px_rgba(56,189,248,0.25)]"
                : hasError
                ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                : isStale
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isRunning
                  ? "bg-sky-500 animate-ping"
                  : hasError
                  ? "bg-red-500"
                  : isStale
                  ? "bg-amber-500"
                  : "bg-emerald-500 shadow-[0_0_6px_#10B981]"
              }`}
            />

            <span className="leading-none font-medium">
              {!freshness.configured
                ? "Source Not Configured"
                : isRunning
                ? "Syncing Source..."
                : hasError
                ? "Sync Warning"
                : isStale
                ? `Stale (${formatAge(freshness.ageSeconds)})`
                : `Synced ${formatAge(freshness.ageSeconds)}`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Manual Sync Button */}
        {freshness.configured && (
          <button
            type="button"
            className="btn btn-sm btn-ghost gap-1.5 text-xs text-[var(--muted-strong)] hover:text-[var(--ink)]"
            onClick={handleRefresh}
            disabled={isRunning}
            title="Pull latest records from Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? "spin" : ""}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
        )}

        <div className="h-4 w-[1px] bg-[var(--line-subtle)] hidden sm:block" />

        {/* Theme Switcher */}
        <ThemeSwitcher />
      </div>
    </header>
  );
}
