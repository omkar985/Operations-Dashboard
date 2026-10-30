"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { User, Lock, ArrowRight, AlertCircle, Eye, EyeOff } from "lucide-react";
import { HeadphoneZoneLogo } from "@/components/ui/headphone-zone-logo";

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    !token ? "Invitation link is invalid or missing. Please contact your administrator." : null
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
      const res = await fetch("/api/auth/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(body.error?.message || "Failed to activate account. The invitation may have expired.");
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

      <div className="flex flex-col items-center text-center mb-7">
        <div className="w-16 h-16 rounded-2xl bg-[var(--raised)] border border-[var(--line)] flex items-center justify-center mb-4 text-[#1588C9] dark:text-[#38BDF8]">
          <HeadphoneZoneLogo className="w-9 h-9" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
          Welcome to the Team
        </h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Complete your profile to activate your Operations Dashboard access
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-3.5 rounded-xl flex items-start gap-3 text-xs bg-red-500/10 text-red-500 border border-red-500/25 shadow-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed font-medium">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="field">
          <label className="label" htmlFor="member-name">
            Your Full Name
          </label>
          <div className="relative group">
            <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors pointer-events-none" />
            <input
              id="member-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              className="input input-with-icon"
              disabled={isSubmitting || !token}
            />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="invitation-password">
            Choose a Password
          </label>
          <div className="relative group">
            <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors pointer-events-none" />
            <input
              id="invitation-password"
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
          <span className="hint">Include at least 12 characters, with letters & numbers.</span>
        </div>

        <div className="field">
          <label className="label" htmlFor="invitation-confirm-password">
            Confirm Password
          </label>
          <div className="relative group">
            <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors pointer-events-none" />
            <input
              id="invitation-confirm-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
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
          <span>{isSubmitting ? "Activating Account..." : "Accept Invitation & Sign In"}</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </form>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="glass max-w-md w-full p-8 text-center text-sm text-[var(--muted)] rounded-2xl">
          Loading invitation...
        </div>
      }
    >
      <AcceptInvitationForm />
    </Suspense>
  );
}
