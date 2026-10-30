"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldAlert, CheckCircle2, AlertCircle } from "lucide-react";
import type { SessionUser } from "@/lib/auth/session";
import { useToast } from "@/components/providers/toast-provider";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { idempotentFetch } from "@/lib/http/idempotent-fetch";

interface UserSettingsViewProps {
  user: SessionUser;
}

export function UserSettingsView({ user }: UserSettingsViewProps) {
  const router = useRouter();
  const toast = useToast();

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Sign out modal state
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isChangingPassword) return;

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 12) {
      setPasswordError("New password must be at least 12 characters long.");
      return;
    }

    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError("Password must include at least one letter and one number.");
      return;
    }

    setPasswordError(null);
    setPasswordSuccess(false);
    setIsChangingPassword(true);

    try {
      const res = await idempotentFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast.success("Password Updated", "Your security credentials have been refreshed.");
      } else {
        setPasswordError(body.error?.message || "Failed to update password. Verify your current password.");
      }
    } catch {
      setPasswordError("Network error. Please try again.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleSignOutEverywhere() {
    setIsSigningOut(true);
    try {
      const res = await idempotentFetch("/api/auth/sign-out-everywhere", { method: "POST" });
      if (res.ok) {
        toast.info("Signed Out Everywhere", "All active sessions have been terminated.");
        router.push("/login");
        router.refresh();
      } else {
        toast.error("Failed to invalidate sessions. Please try again.");
        setIsSigningOut(false);
      }
    } catch {
      toast.error("Network error while terminating sessions.");
      setIsSigningOut(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* 1. Account Profile */}
      <section className="panel p-6">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] font-bold text-lg">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-[var(--ink)]">
              {user.name || "Member"}
            </h2>
            <p className="text-xs text-[var(--muted)] font-mono mt-0.5">
              {user.email}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="badge badge-brand text-[11px]">
                Role: {user.role}
              </span>
              <span className="text-[11px] text-[var(--muted)] font-mono">
                ID: {user.id.slice(0, 8)}...
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Change Password */}
      <section className="panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-[var(--primary)]" />
          <h2 className="panel-title">Change Password</h2>
        </div>
        <p className="panel-sub mb-4">
          Ensure your account uses a secure password of at least 12 characters.
        </p>

        {passwordSuccess && (
          <div className="mb-4 p-3 rounded-lg flex items-center gap-2 text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Password successfully changed.</span>
          </div>
        )}

        {passwordError && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg flex items-start gap-2 text-xs bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900/60"
          >
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
          <div className="field">
            <label className="label" htmlFor="current-pw">
              Current Password
            </label>
            <input
              id="current-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
              autoComplete="current-password"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="new-pw">
              New Password
            </label>
            <input
              id="new-pw"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
            <span className="hint">Must be 12+ characters, with letters &amp; numbers.</span>
          </div>

          <div className="field">
            <label className="label" htmlFor="confirm-pw">
              Confirm New Password
            </label>
            <input
              id="confirm-pw"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={isChangingPassword}
          >
            {isChangingPassword ? "Saving..." : "Update Password"}
          </button>
        </form>
      </section>

      {/* 3. Session Security */}
      <section className="panel p-6 border-red-200/60 dark:border-red-900/30">
        <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
          <ShieldAlert className="w-4 h-4" />
          <h2 className="panel-title text-inherit">Session Revocation</h2>
        </div>
        <p className="text-xs text-[var(--muted)] mb-4 leading-relaxed">
          If you believe your account has been compromised or you left an active session on an untrusted device, terminate all active tokens across all browsers immediately.
        </p>

        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => setIsSignOutModalOpen(true)}
        >
          Sign Out of All Devices
        </button>
      </section>

      <ConfirmationModal
        isOpen={isSignOutModalOpen}
        onClose={() => setIsSignOutModalOpen(false)}
        onConfirm={handleSignOutEverywhere}
        title="Revoke All Sessions?"
        description="This will immediately invalidate your active session tokens on all browsers, laptops, and mobile devices. You will need to sign in again."
        confirmLabel="Sign Out Everywhere"
        variant="danger"
        isLoading={isSigningOut}
      />
    </div>
  );
}
