"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(body.error?.message || "Failed to process request. Please try again.");
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

      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] mb-6 transition-colors font-medium group"
      >
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
        <span>Back to sign in</span>
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
          Reset Password
        </h1>
        <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">
          Enter your registered work email and we will dispatch a password recovery link.
        </p>
      </div>

      {submitted ? (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold block text-sm mb-1 text-[var(--ink)]">
                  Recovery email dispatched
                </span>
                If an active account exists for <strong className="font-semibold text-[var(--ink)]">{email}</strong>, you will receive an email shortly with instructions to reset your password.
              </div>
            </div>
          </div>

          <Link href="/login" className="btn btn-primary w-full h-11 text-sm font-semibold">
            Return to sign in
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
            <label className="label" htmlFor="recovery-email">
              Work Email
            </label>
            <div className="relative group">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors pointer-events-none" />
              <input
                id="recovery-email"
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

          <button
            type="submit"
            className="btn btn-primary w-full mt-2 font-semibold h-11 text-sm shadow-lg group"
            disabled={isSubmitting}
          >
            <span>{isSubmitting ? "Dispatching link..." : "Send Reset Link"}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>
      )}
    </div>
  );
}
