"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock, ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { HeadphoneZoneLogo } from "@/components/ui/headphone-zone-logo";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(
    !token ? "Password reset link is missing or invalid. Please request a new link." : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 12) {
      setError("Password must be at least 12 characters long.");
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Password must contain at least one letter and one number.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(body.error?.message || "Failed to reset password. The link may have expired.");
      }
    } catch {
      setError("An unexpected network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="glass p-8 sm:p-10 shadow-2xl rounded-2xl border border-[var(--line)] relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Radiant Top Luminous Highlight */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#38BDF8] to-transparent opacity-80" />

      <div className="flex items-center justify-between mb-6">
        <div className="w-8 h-8 rounded-lg bg-[var(--raised)] border border-[var(--line)] flex items-center justify-center text-[#1588C9] dark:text-[#38BDF8]">
          <HeadphoneZoneLogo className="w-4.5 h-4.5" />
        </div>
      </div>

      <div className="mb-6">
        <h1 className="dm-serif-display-regular text-2xl sm:text-3xl text-[var(--ink)] tracking-tight">
          Set New Password
        </h1>
        <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">
          Create a secure password with at least 12 characters, including letters and numbers.
        </p>
      </div>

      {submitted ? (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold block text-sm mb-1 text-[var(--ink)]">
                  Password updated successfully
                </span>
                Your new password is now active. All previous sessions have been invalidated.
              </div>
            </div>
          </div>

          <Link href="/login" className="btn btn-primary w-full h-11 text-sm font-semibold">
            Sign in with new password
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl flex items-start gap-3 text-xs bg-red-500/10 text-red-500 border border-red-500/25 shadow-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="new-password">
              New Password
            </label>
            <div className="relative group">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors pointer-events-none" />
              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 12 characters"
                className="input input-with-icon input-with-icon-right"
                disabled={isSubmitting || !token}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] transition-colors p-1"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="confirm-new-password">
              Confirm Password
            </label>
            <div className="relative group">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors pointer-events-none" />
              <input
                id="confirm-new-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="input input-with-icon input-with-icon-right"
                disabled={isSubmitting || !token}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full mt-2 font-semibold h-11 text-sm group"
            disabled={isSubmitting || !token}
          >
            <span>{isSubmitting ? "Updating Password..." : "Update Password"}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="glass max-w-md w-full p-8 text-center text-sm text-[var(--muted)] rounded-2xl">
          Loading reset form...
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
