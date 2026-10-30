"use client";

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
  LogOut,
  X,
} from "lucide-react";
import { HeadphoneZoneLogo } from "@/components/ui/headphone-zone-logo";
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
  { label: "Executive Overview", href: "/dashboard", icon: LayoutDashboard },
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

export function Sidebar({ user, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
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
        <div>
          <div className="flex items-center justify-between px-5 h-[56px] border-b border-[var(--line-subtle)]">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 text-inherit no-underline hover:no-underline group"
              onClick={onClose}
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--raised)] border border-[var(--line)] text-[#1588C9] dark:text-[#38BDF8] shrink-0 transition-colors">
                <HeadphoneZoneLogo className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-[14px] tracking-tight text-[var(--ink)] leading-none">
                  Operations
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--primary-ink)] mt-1">
                  Command Centre
                </span>
              </div>
            </Link>

            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon lg:hidden text-[var(--muted)]"
              onClick={onClose}
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-6 overflow-y-auto max-h-[calc(100dvh-130px)]">
            <div>
              <div className="eyebrow px-3 mb-2 text-[10px]">Operations</div>
              <div className="space-y-1">
                {OPERATIONS_NAV.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="nav-link"
                      aria-current={active ? "page" : undefined}
                      onClick={onClose}
                    >
                      {active && <span className="nav-rail" />}
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {user.role === "ADMIN" && (
              <div>
                <div className="eyebrow px-3 mb-2 text-[10px]">Administration</div>
                <div className="space-y-1">
                  {ADMIN_NAV.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="nav-link"
                        aria-current={active ? "page" : undefined}
                        onClick={onClose}
                      >
                        {active && <span className="nav-rail" />}
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </nav>
        </div>

        {/* Footer User Profile & Logout */}
        <div className="p-3 border-t border-[var(--line-subtle)] bg-[var(--raised)]/50 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl glass border border-[var(--line)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0284C7] to-[#1D4ED8] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                {(user.name || user.email || "U").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-[var(--ink)] truncate">
                  {user.name || user.email}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      user.role === "ADMIN" ? "bg-[var(--primary)]" : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--muted)]">
                    {user.role}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon text-[var(--muted)] hover:text-red-500 transition-colors"
              onClick={handleSignOut}
              title="Sign Out"
              aria-label="Sign out of Command Centre"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
