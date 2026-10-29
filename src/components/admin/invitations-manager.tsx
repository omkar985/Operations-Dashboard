"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Mail, Copy, Check, RotateCcw, Trash2, X } from "lucide-react";
import type { InvitationWithInviter } from "@/server/repositories/invitations";
import type { UserRole } from "@/types/db";
import { useToast } from "@/components/providers/toast-provider";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

interface InvitationsManagerProps {
  initialInvitations: InvitationWithInviter[];
}

export function InvitationsManager({ initialInvitations }: InvitationsManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [invitations, setInvitations] = useState<InvitationWithInviter[]>(initialInvitations);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [nowMs] = useState(() => Date.now());

  // Form state
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("USER");
  const [isCreating, setIsCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revokeTarget, setRevokeTarget] = useState<InvitationWithInviter | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  async function handleCreateInvitation(e: React.FormEvent) {
    e.preventDefault();
    if (isCreating) return;

    setIsCreating(true);
    setCreatedUrl(null);

    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Invitation Created", `An invitation email was queued for ${email}.`);
        if (body.data?.result?.invitationUrl) {
          setCreatedUrl(body.data.result.invitationUrl);
        }
        setEmail("");
        router.refresh();
      } else {
        toast.error("Failed to Create Invitation", body.error?.message || "An error occurred.");
      }
    } catch {
      toast.error("Network Error", "Unable to create invitation.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleResend(invite: InvitationWithInviter) {
    try {
      const res = await fetch(`/api/admin/invitations/${invite.id}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Invitation Resent", `A new invitation link was generated and dispatched to ${invite.email}.`);
        if (body.data?.result?.invitationUrl) {
          navigator.clipboard.writeText(body.data.result.invitationUrl).catch(() => {});
          toast.info("Link Copied", "The new invitation URL has also been copied to your clipboard.");
        }
        router.refresh();
      } else {
        toast.error("Failed to Resend", body.error?.message || "Could not resend invitation.");
      }
    } catch {
      toast.error("Network Error", "Failed to contact invitation service.");
    }
  }

  async function handleConfirmRevoke() {
    if (!revokeTarget) return;
    setIsRevoking(true);

    try {
      const res = await fetch(`/api/admin/invitations/${revokeTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Invitation Revoked", `The invitation for ${revokeTarget.email} was cancelled.`);
        setInvitations((prev) =>
          prev.map((i) => (i.id === revokeTarget.id ? { ...i, status: "revoked" } : i))
        );
        setRevokeTarget(null);
        router.refresh();
      } else {
        toast.error("Failed to revoke invitation.");
      }
    } catch {
      toast.error("Network error while revoking invitation.");
    } finally {
      setIsRevoking(false);
    }
  }

  function copyToClipboard(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("Copied to Clipboard", "Invitation URL copied.");
    });
  }

  return (
    <>
      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--muted)]">
            Manage pending team invites, token rotations, and access links
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1.5"
            onClick={() => {
              setCreatedUrl(null);
              setIsInviteDialogOpen(true);
            }}
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Team Member</span>
          </button>
        </div>

        {/* Create Invitation Modal Dialog */}
        {isInviteDialogOpen && (
          <div className="scrim flex items-center justify-center p-4">
            <div className="panel max-w-lg w-full p-6 shadow-pop animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[var(--primary)]" />
                  <h3 className="text-base font-semibold text-[var(--ink)]">
                    Invite New Member
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => setIsInviteDialogOpen(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {createdUrl ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs">
                    <p className="font-semibold text-sm mb-1">
                      Invitation Generated!
                    </p>
                    An email was dispatched via the transactional outbox. You can also share the direct link below:
                  </div>

                  <div className="field">
                    <label className="label">Direct Invitation URL</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={createdUrl}
                        className="input font-mono text-xs"
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => copyToClipboard(createdUrl)}
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setIsInviteDialogOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateInvitation} className="space-y-4">
                  <div className="field">
                    <label className="label" htmlFor="invite-email">
                      Work Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[var(--muted)] pointer-events-none" />
                      <input
                        id="invite-email"
                        type="email"
                        required
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="colleague@company.com"
                        className="input pl-9"
                        disabled={isCreating}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="invite-role">
                      Assigned Role
                    </label>
                    <select
                      id="invite-role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="select"
                      disabled={isCreating}
                    >
                      <option value="USER">USER — Read and operational access</option>
                      <option value="ADMIN">ADMIN — Full system configuration access</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--line-subtle)]">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setIsInviteDialogOpen(false)}
                      disabled={isCreating}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={isCreating}
                    >
                      {isCreating ? "Creating Invite..." : "Send Invitation"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Invitations Table */}
        <div className="panel overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Recipient Email</th>
                  <th>Assigned Role</th>
                  <th>Status</th>
                  <th>Invited By</th>
                  <th>Expires</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[var(--muted)]">
                      No invitations have been dispatched yet.
                    </td>
                  </tr>
                ) : (
                  invitations.map((invite) => {
                    const isPending = invite.status === "pending";
                    const isExpired = new Date(invite.expires_at).getTime() < nowMs;

                    return (
                      <tr key={invite.id}>
                        <td className="font-medium text-xs text-[var(--ink)]">
                          {invite.email}
                        </td>

                        <td>
                          <span className="badge badge-brand text-[11px]">
                            {invite.role}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`badge ${
                              invite.status === "accepted"
                                ? "badge-success"
                                : invite.status === "revoked"
                                ? "badge-error"
                                : isExpired
                                ? "badge-warning"
                                : "badge-info"
                            }`}
                          >
                            {invite.status === "pending" && isExpired
                              ? "Expired"
                              : invite.status}
                          </span>
                        </td>

                        <td className="text-xs text-[var(--muted)]">
                          {invite.inviter?.name || invite.inviter?.email || "System"}
                        </td>

                        <td className="text-xs text-[var(--muted)] font-mono">
                          {new Date(invite.expires_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>

                        <td className="num">
                          {isPending && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm !h-7 !text-xs !px-2 text-[var(--primary-ink)]"
                                onClick={() => handleResend(invite)}
                                title="Rotate token and dispatch new email"
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                <span>Resend</span>
                              </button>

                              <button
                                type="button"
                                className="btn btn-ghost btn-sm !h-7 !text-xs !px-2 text-red-600 hover:text-red-700"
                                onClick={() => setRevokeTarget(invite)}
                                title="Revoke invitation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleConfirmRevoke}
        title="Revoke Invitation?"
        description={`This will cancel the pending invitation for ${revokeTarget?.email}. Any links sent will no longer function.`}
        confirmLabel="Revoke Invitation"
        variant="danger"
        isLoading={isRevoking}
      />
    </>
  );
}
