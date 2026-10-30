"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, LogOut } from "lucide-react";
import { HeadphoneZoneLogo } from "@/components/ui/headphone-zone-logo";
import type { Freshness } from "@/server/services/dataset-service";
import type { SessionUser } from "@/lib/auth/session";

interface TopbarProps {
  user: SessionUser;
  freshness: Freshness;
  onMenuClick?: () => void;
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

export function Topbar({ user, freshness }: TopbarProps) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await fetch("/api/auth/logout", { credentials: "include" });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  }

  const isRunning = freshness.lastRunStatus === "running";
  const isStale = freshness.stale;
  const hasError = freshness.lastError !== null;
  const isAdmin = user.role === "ADMIN";

  return (
    <header className="topbar">
      {/* Left: Headphone Zone Brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <HeadphoneZoneLogo size={18} className="text-[#1588C9] dark:text-[#38BDF8] shrink-0" aria-hidden />
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--muted-strong)] select-none">
            Headphone Zone
          </span>
        </div>

        {/* Live System Indicator */}
        <div className="hidden md:flex items-center gap-2 ml-2">
          <div
            className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-semibold border backdrop-blur-md transition-all ${
              !freshness.configured
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25"
                : isRunning
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"
                : hasError
                ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25"
                : isStale
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isRunning
                  ? "bg-sky-500 animate-ping"
                  : hasError
                  ? "bg-red-500"
                  : isStale
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
            />
            <span className="leading-none font-medium">
              {!freshness.configured
                ? "Source Unconfigured"
                : isRunning
                ? "Syncing..."
                : hasError
                ? "Sync Notice"
                : isStale
                ? `Stale (${formatAge(freshness.ageSeconds)})`
                : `Synced ${formatAge(freshness.ageSeconds)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Right: User Account, Admin Settings, and Sign Out */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* User Card */}
        <div
          className="inline-flex items-center gap-2 sm:gap-2.5 h-9 px-3 rounded-xl bg-[var(--card)] border border-[var(--line)] shadow-xs select-none"
          title={`Signed in: ${user.email} (${user.role})`}
        >
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#0284C7] to-[#1D4ED8] text-white font-bold text-[10px] flex items-center justify-center shrink-0">
            {(user.name || user.email || "U").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs sm:text-[13px] font-medium text-[var(--ink)] truncate max-w-[120px] sm:max-w-[200px] leading-none">
              {user.email}
            </span>
            {isAdmin ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 leading-none">
                Admin
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-[var(--raised)] text-[var(--muted-strong)] border border-[var(--line)] leading-none">
                Team
              </span>
            )}
          </div>
        </div>

        {/* Admin Settings Button */}
        {isAdmin && (
          <Link
            href="/admin/members"
            className="inline-flex items-center justify-center gap-2 h-9 px-3 sm:px-3.5 rounded-xl border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:border-[var(--line-hover)] hover:bg-[var(--surface-hover)] shadow-xs text-xs sm:text-[13px] font-medium transition-all select-none cursor-pointer group"
            title="Open Admin Settings"
            aria-label="Admin Settings"
          >
            <Settings className="w-4 h-4 shrink-0 text-[var(--muted)] group-hover:text-[var(--ink)] transition-colors" />
            <span className="hidden sm:inline leading-none font-medium">Admin Settings</span>
          </Link>
        )}

        {/* Sign Out Button */}
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center justify-center gap-2 h-9 px-3 sm:px-3.5 rounded-xl border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 shadow-xs text-xs sm:text-[13px] font-medium transition-all select-none cursor-pointer group"
          title="Sign out of Operations Dashboard"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4 shrink-0 text-[var(--muted)] group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors" />
          <span className="hidden sm:inline leading-none font-medium">Sign Out</span>
        </button>
      </div>
    </header>
  );
}
