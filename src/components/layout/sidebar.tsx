"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TableProperties,
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
    { label: "My Preferences", href: "/settings", icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Team Members", href: "/admin/members", icon: Users },
  { label: "Member Invites", href: "/admin/invitations", icon: UserPlus },
  { label: "Email Outbox", href: "/admin/outbox", icon: Send },
  { label: "Sheet Source & Maps", href: "/admin/source", icon: Database },
  { label: "System & Audit Logs", href: "/admin/system", icon: ShieldCheck },
];

const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

/** Real-time 12-hour clock ticking live with seconds and AM/PM */
function useRealtimeClock() {
  const mounted = useMounted();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
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
          <div className="flex items-center px-5 pt-5 pb-3 shrink-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 text-inherit no-underline hover:no-underline group min-w-0"
              onClick={onClose}
            >
              <HeadphoneZoneLogo
                size={28}
                className="text-[#0284C7] dark:text-[#00F0FF] shrink-0 transition-colors"
                aria-hidden
              />
              <div className="leading-tight min-w-0">
                <p className="dm-serif-display-regular text-[18px] text-[var(--ink)] tracking-tight whitespace-nowrap">
                  Operations Dashboard
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Headphone Zone
                </p>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-5 overflow-y-auto flex-1">
            <div>
              <div className="px-3 mb-2 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Operations
              </div>
              <ul className="space-y-1 list-none p-0 m-0">
                {OPERATIONS_NAV.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`group relative flex h-10 items-center gap-3 rounded-xl px-3 overflow-hidden text-[13.5px] font-medium transition-all duration-150 ${
                          active
                            ? "bg-[var(--primary-soft)] text-[var(--primary-ink)] font-semibold border border-[var(--primary-soft)] dark:bg-white/10 dark:text-white dark:border-white/10 shadow-xs"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/6"
                        }`}
                        aria-current={active ? "page" : undefined}
                        onClick={onClose}
                      >
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-1 top-2.5 h-5 w-[3px] rounded-full bg-[var(--primary)] dark:bg-[#00F0FF]"
                          />
                        )}
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            active
                              ? "text-[var(--primary)] dark:text-[#00F0FF]"
                              : "text-slate-400 group-hover:text-slate-800 dark:text-slate-400 dark:group-hover:text-white"
                          }`}
                        />
                        <span
                          className={`transition-colors ${
                            active
                              ? "text-[var(--primary-ink)] dark:text-white font-semibold"
                              : "text-slate-600 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white"
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
                <div className="px-3 mb-2 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  Administration
                </div>
                <ul className="space-y-1 list-none p-0 m-0">
                  {ADMIN_NAV.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`group relative flex h-10 items-center gap-3 rounded-xl px-3 overflow-hidden text-[13.5px] font-medium transition-all duration-150 ${
                            active
                              ? "bg-[var(--primary-soft)] text-[var(--primary-ink)] font-semibold border border-[var(--primary-soft)] dark:bg-white/10 dark:text-white dark:border-white/10 shadow-xs"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/6"
                          }`}
                          aria-current={active ? "page" : undefined}
                          onClick={onClose}
                        >
                          {active && (
                            <span
                              aria-hidden
                              className="absolute left-1 top-2.5 h-5 w-[3px] rounded-full bg-[var(--primary)] dark:bg-[#00F0FF]"
                            />
                          )}
                          <Icon
                            className={`w-4 h-4 shrink-0 transition-colors ${
                              active
                                ? "text-[var(--primary)] dark:text-[#00F0FF]"
                                : "text-slate-400 group-hover:text-slate-800 dark:text-slate-400 dark:group-hover:text-white"
                            }`}
                          />
                          <span
                            className={`transition-colors ${
                              active
                                ? "text-[var(--primary-ink)] dark:text-white font-semibold"
                                : "text-slate-600 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white"
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
        <div className="p-3 border-t border-[var(--line)] shrink-0">
          <div className="flex flex-col gap-2.5 rounded-xl p-3 border border-[var(--line)] bg-[var(--raised)] text-[var(--ink)] shadow-xs">
            {/* Theme Switch */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line-subtle)]">
              <span
                className="text-[12px] font-medium text-[var(--muted-strong)] flex items-center gap-1.5"
                suppressHydrationWarning
              >
                {resolvedTheme === "dark" ? (
                  <Moon className="w-3.5 h-3.5 text-sky-400" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
                {resolvedTheme === "dark" ? "Dark theme" : "Light theme"}
              </span>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                suppressHydrationWarning
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-[var(--line)] transition-colors duration-200 ease-in-out focus:outline-none ${
                  resolvedTheme === "dark" ? "bg-sky-500" : "bg-amber-500"
                }`}
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
              <span className="text-[13px] font-bold text-[var(--ink)] tracking-tight font-mono mt-0.5">
                {timeStr}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
