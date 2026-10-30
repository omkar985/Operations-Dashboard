"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  TableProperties,
  BarChart3,
  Settings,
  Users,
  UserPlus,
  Send,
  Database,
  ShieldCheck,
  Moon,
  Sun,
} from "lucide-react";
import { HeadphoneZoneLogo } from "@/components/ui/headphone-zone-logo";
import { useTheme } from "@/components/providers/theme-provider";
import type { SessionUser } from "@/lib/auth/session";

interface SidebarProps {
  user: SessionUser;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const OPERATIONS_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Operations Ledger", href: "/operations", icon: TableProperties },
  { label: "Analytics & SLA", href: "/reports", icon: BarChart3 },
  { label: "My Preferences", href: "/settings", icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Team Members", href: "/admin/members", icon: Users },
  { label: "Member Invites", href: "/admin/invitations", icon: UserPlus },
  { label: "Email Outbox", href: "/admin/outbox", icon: Send },
  { label: "Sheet Source & Maps", href: "/admin/source", icon: Database },
  { label: "System & Audit Logs", href: "/admin/system", icon: ShieldCheck },
];

/** Real-time 12-hour clock ticking live with seconds and AM/PM */
function useRealtimeClock() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) {
    return {
      timeStr: "--:--:-- --",
      dateStr: "Synchronizing clock...",
    };
  }

  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return { timeStr, dateStr };
}

export function Sidebar({ user, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { timeStr, dateStr } = useRealtimeClock();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {/* Mobile scrim overlay */}
      {isOpen && (
        <div
          className="scrim lg:hidden animate-in fade-in duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className="sidebar flex flex-col justify-between"
        data-open={isOpen ? "true" : undefined}
        aria-label="Main Navigation"
      >
        {/* Top Header & Brand */}
        <div className="flex flex-col min-h-0 flex-1">
          <div className="flex items-center px-5 h-[64px] border-b border-[var(--line-subtle)] shrink-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 text-inherit no-underline hover:no-underline group min-w-0"
              onClick={onClose}
            >
              <HeadphoneZoneLogo size={28} className="text-[#1588C9] dark:text-[#38BDF8] shrink-0" aria-hidden />
              <div className="leading-tight min-w-0">
                <p className="dm-serif-display-regular text-[18px] text-[var(--ink)] tracking-tight whitespace-nowrap">
                  Operations Dashboard
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Headphone Zone
                </p>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-5 overflow-y-auto flex-1">
            <div>
              <div className="eyebrow px-3 mb-2 text-[10px]">Operations</div>
              <ul className="space-y-1 list-none p-0 m-0">
                {OPERATIONS_NAV.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-all duration-150 ${
                          active
                            ? "bg-[var(--card)] text-white font-semibold shadow-xs border border-[var(--line-subtle)]"
                            : "text-[#94A3B8] hover:bg-[var(--surface-hover)] hover:text-white"
                        }`}
                        aria-current={active ? "page" : undefined}
                        onClick={onClose}
                      >
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-2.5 h-5 w-[3px] rounded-r-full bg-[#1588C9] dark:bg-[#38BDF8]"
                          />
                        )}
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            active
                              ? "text-[#1588C9] dark:text-[#38BDF8]"
                              : "text-[#94A3B8] group-hover:text-white"
                          }`}
                        />
                        <span
                          className={`transition-colors ${
                            active
                              ? "text-slate-900 dark:text-white font-semibold"
                              : "text-[#94A3B8] group-hover:text-slate-900 dark:group-hover:text-white"
                          }`}
                        >
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {user.role === "ADMIN" && (
              <div>
                <div className="eyebrow px-3 mb-2 text-[10px]">Administration</div>
                <ul className="space-y-1 list-none p-0 m-0">
                  {ADMIN_NAV.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-all duration-150 ${
                            active
                              ? "bg-[var(--card)] text-white font-semibold shadow-xs border border-[var(--line-subtle)]"
                              : "text-[#94A3B8] hover:bg-[var(--surface-hover)] hover:text-white"
                          }`}
                          aria-current={active ? "page" : undefined}
                          onClick={onClose}
                        >
                          {active && (
                            <span
                              aria-hidden
                              className="absolute left-0 top-2.5 h-5 w-[3px] rounded-r-full bg-[#1588C9] dark:bg-[#38BDF8]"
                            />
                          )}
                          <Icon
                            className={`w-4 h-4 shrink-0 transition-colors ${
                              active
                                ? "text-[#1588C9] dark:text-[#38BDF8]"
                                : "text-[#94A3B8] group-hover:text-white"
                            }`}
                          />
                          <span
                            className={`transition-colors ${
                              active
                                ? "text-slate-900 dark:text-white font-semibold"
                                : "text-[#94A3B8] group-hover:text-slate-900 dark:group-hover:text-white"
                            }`}
                          >
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </nav>
        </div>

        {/* Sidebar Bottom: Theme Switcher & Real-time 12-HR Clock */}
        <div className="p-3 border-t border-[var(--line-subtle)] shrink-0">
          <div
            className="flex flex-col gap-2.5 rounded-xl p-3 border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] shadow-xs"
          >
            {/* Theme Switch */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line-subtle)]">
              <span className="text-[12px] font-medium text-[var(--muted)] flex items-center gap-1.5">
                {resolvedTheme === "dark" ? (
                  <Moon className="w-3.5 h-3.5 text-[var(--primary-ink)]" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-[var(--primary-ink)]" />
                )}
                {resolvedTheme === "dark" ? "Dark theme" : "Light theme"}
              </span>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-[var(--line)] transition-colors duration-200 ease-in-out focus:outline-none"
                style={{
                  background:
                    resolvedTheme === "dark"
                      ? "var(--primary)"
                      : "rgba(100, 116, 139, 0.25)",
                }}
              >
                <span
                  className={`pointer-events-none inline-block size-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out mt-[2px] ${
                    resolvedTheme === "dark" ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {/* Real-time Date and 12-HR Clock */}
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-[var(--muted)]">
                {dateStr}
              </span>
              <span className="text-[13px] font-bold text-[var(--ink)] tracking-tight tnum mt-0.5">
                {timeStr}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
