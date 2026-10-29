"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Radio, AlertCircle, ArrowRight, Lock, Mail, Eye, EyeOff } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/dashboard";
  const reason = searchParams.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    reason === "session" ? "Your session has expired. Please sign in again." : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        router.push(nextUrl);
        router.refresh();
      } else {
        setError(body.error?.message || "Invalid email or password.");
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

      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0284C7]/20 via-[#00F0FF]/15 to-transparent border border-[#38BDF8]/40 shadow-[0_0_25px_rgba(2,132,199,0.35)] flex items-center justify-center mb-4 text-[#0284C7] dark:text-[#38BDF8]">
          <Radio className="w-8 h-8 stroke-[2.2] animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
          Operations Command Centre
        </h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Sign in to access real-time operational telemetry
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="mb-6 p-3.5 rounded-xl flex items-start gap-3 text-xs bg-red-500/10 text-red-500 border border-red-500/25 shadow-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed font-medium">{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="field">
          <label className="label" htmlFor="email-input">
            Work Email
          </label>
          <div className="relative group">
            <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors pointer-events-none" />
            <input
              id="email-input"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="input input-with-icon"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="field">
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password-input">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-[var(--primary-ink)] hover:underline font-semibold"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative group">
            <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors pointer-events-none" />
            <input
              id="password-input"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="input input-with-icon input-with-icon-right"
              disabled={isSubmitting}
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

        <button
          type="submit"
          className="btn btn-primary w-full mt-2 font-semibold h-11 text-sm shadow-lg group"
          disabled={isSubmitting}
        >
          <span>{isSubmitting ? "Authenticating..." : "Sign in to Dashboard"}</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="glass max-w-md w-full p-8 text-center text-sm text-[var(--muted)] rounded-2xl">
          Loading sign in...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
