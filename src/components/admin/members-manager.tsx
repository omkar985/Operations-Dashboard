"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserX, UserCheck, Search, X } from "lucide-react";
import type { UserRow, UserRole } from "@/types/db";
import type { SessionUser } from "@/lib/auth/session";
import { useToast } from "@/components/providers/toast-provider";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

interface MembersManagerProps {
  currentUser: SessionUser;
  initialUsers: UserRow[];
}

export function MembersManager({ currentUser, initialUsers }: MembersManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [search, setSearch] = useState("");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserRow | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    role?: UserRole;
    isActive?: boolean;
    title: string;
    description: string;
    variant: "danger" | "primary";
    confirmLabel: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeAdminCount = users.filter((u) => u.role === "ADMIN" && u.is_active).length;

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  function promptRoleChange(user: UserRow, newRole: UserRole) {
    if (user.role === "ADMIN" && activeAdminCount <= 1 && newRole !== "ADMIN") {
      toast.error("Action Prohibited", "You cannot demote the last remaining active administrator.");
      return;
    }

    setTargetUser(user);
    setPendingAction({
      role: newRole,
      title: `Change Role to ${newRole}?`,
      description: `This will update ${user.name}'s permissions to ${newRole}. Their active sessions will remain valid with updated rights.`,
      variant: newRole === "ADMIN" ? "primary" : "danger",
      confirmLabel: `Change to ${newRole}`,
    });
    setModalOpen(true);
  }

  function promptStatusChange(user: UserRow, newStatus: boolean) {
    if (user.role === "ADMIN" && activeAdminCount <= 1 && !newStatus) {
      toast.error("Action Prohibited", "You cannot deactivate the last remaining active administrator.");
      return;
    }

    setTargetUser(user);
    setPendingAction({
      isActive: newStatus,
      title: newStatus ? `Reactivate ${user.name}?` : `Suspend ${user.name}?`,
      description: newStatus
        ? `${user.name} will be able to sign in and access the Operations Dashboard again.`
        : `${user.name}'s account will be suspended and all active sessions will be terminated immediately.`,
      variant: newStatus ? "primary" : "danger",
      confirmLabel: newStatus ? "Reactivate Member" : "Suspend Account",
    });
    setModalOpen(true);
  }

  async function handleConfirmAction() {
    if (!targetUser || !pendingAction) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/admin/members/${targetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: pendingAction.role,
          isActive: pendingAction.isActive,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Member Updated", `${targetUser.name}'s profile was updated successfully.`);
        // Update local state
        setUsers((prev) =>
          prev.map((u) =>
            u.id === targetUser.id
              ? {
                  ...u,
                  ...(pendingAction.role !== undefined && { role: pendingAction.role }),
                  ...(pendingAction.isActive !== undefined && { is_active: pendingAction.isActive }),
                }
              : u
          )
        );
        setModalOpen(false);
        router.refresh();
      } else {
        toast.error("Action Failed", body.error?.message || "Failed to update member.");
      }
    } catch {
      toast.error("Network Error", "Unable to update member profile.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="panel overflow-hidden">
        {/* Header Controls */}
        <div className="panel-head flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="panel-title">Active Team Roster</h2>
            <p className="panel-sub">
              {users.length} member{users.length === 1 ? "" : "s"} with authorized Operations Dashboard access
            </p>
          </div>

          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="input input-search !h-9 text-xs w-full rounded-lg"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] p-0.5 rounded transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Members Table */}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="min-w-[240px]">Member</th>
                <th className="w-32">Role</th>
                <th className="w-28">Status</th>
                <th className="w-36">Last Login</th>
                <th className="w-36">Joined</th>
                <th className="w-28 num text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-[var(--muted)]">
                    No members matching &ldquo;{search}&rdquo;.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((member) => {
                  const isSelf = member.id === currentUser.id;
                  const isSoleAdmin = member.role === "ADMIN" && activeAdminCount <= 1;

                  return (
                    <tr key={member.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--raised)] border border-[var(--line-subtle)] font-bold text-xs text-[var(--primary)] shrink-0">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-xs text-[var(--ink)] truncate">
                              {member.name} {isSelf && <span className="text-[10px] text-[var(--primary-ink)] font-bold ml-1">(You)</span>}
                            </span>
                            <span className="text-[11px] text-[var(--muted)] font-mono mt-0.5 truncate">
                              {member.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={member.role}
                            onChange={(e) => promptRoleChange(member, e.target.value as UserRole)}
                            disabled={isSoleAdmin}
                            className="select !h-8 !text-xs !py-0 !pl-2.5 !pr-7 rounded-lg w-24"
                            title={isSoleAdmin ? "Cannot demote the last remaining active administrator." : undefined}
                          >
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            member.is_active ? "badge-success" : "badge-error"
                          }`}
                        >
                          {member.is_active ? "Active" : "Suspended"}
                        </span>
                      </td>

                      <td className="text-xs text-[var(--muted)] font-mono">
                        {member.last_login_at
                          ? new Date(member.last_login_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "Never"}
                      </td>

                      <td className="text-xs text-[var(--muted)] font-mono">
                        {new Date(member.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      <td className="num">
                        <button
                          type="button"
                          className={`btn btn-sm !h-8 !text-xs !px-3 gap-1.5 ${
                            member.is_active ? "btn-danger" : "btn-primary"
                          }`}
                          onClick={() => promptStatusChange(member, !member.is_active)}
                          disabled={isSoleAdmin && member.is_active}
                          title={
                            isSoleAdmin && member.is_active
                              ? "Cannot suspend the last administrator."
                              : member.is_active
                              ? "Suspend member access"
                              : "Reactivate member account"
                          }
                        >
                          {member.is_active ? (
                            <>
                              <UserX className="w-3.5 h-3.5" />
                              <span>Suspend</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Reactivate</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendingAction && (
        <ConfirmationModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onConfirm={handleConfirmAction}
          title={pendingAction.title}
          description={pendingAction.description}
          confirmLabel={pendingAction.confirmLabel}
          variant={pendingAction.variant}
          isLoading={isSubmitting}
        />
      )}
    </>
  );
}
