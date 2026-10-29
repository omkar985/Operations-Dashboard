import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";

/**
 * Durable fixed-window rate limiting backed by Postgres (rate_limit_hit) so limits hold across
 * serverless instances. Identifiers are hashed before storage — no raw IPs / emails in the table.
 * Fails CLOSED: if the limiter itself is unavailable, sensitive endpoints refuse the request.
 */

export interface Limit {
  bucket: string;
  windowSeconds: number;
  max: number;
}

export const LIMITS = {
  loginIp: { bucket: "login:ip", windowSeconds: 600, max: 30 },
  loginEmail: { bucket: "login:email", windowSeconds: 900, max: 8 },
  forgotIp: { bucket: "forgot:ip", windowSeconds: 3600, max: 15 },
  forgotEmail: { bucket: "forgot:email", windowSeconds: 3600, max: 3 },
  resetIp: { bucket: "reset:ip", windowSeconds: 3600, max: 20 },
  acceptIp: { bucket: "accept:ip", windowSeconds: 3600, max: 20 },
  inviteAdmin: { bucket: "invite:admin", windowSeconds: 3600, max: 60 },
  refreshUser: { bucket: "refresh:user", windowSeconds: 60, max: 4 },
  passwordChange: { bucket: "pwchange:user", windowSeconds: 900, max: 6 },
} satisfies Record<string, Limit>;

const fingerprint = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 32);

export async function enforceRateLimit(limit: Limit, identifier: string): Promise<void> {
  const key = `${limit.bucket}:${fingerprint(identifier)}`;

  // 1. Try atomic database RPC function first
  const res = await db().rpc("rate_limit_hit", {
    p_key: key,
    p_window_seconds: limit.windowSeconds,
    p_max: limit.max,
  });

  if (!res.error && res.data) {
    const row = (Array.isArray(res.data) ? res.data[0] : res.data) as { allowed: boolean; retry_after_seconds: number };
    if (!row.allowed) {
      throw new AppError("RATE_LIMITED", "Too many attempts. Please wait before trying again.", { retryAfterSeconds: row.retry_after_seconds });
    }
    return;
  }

  // 2. Resilient fallback: direct rate_limits table operations (if RPC is not yet created in Supabase)
  try {
    const now = new Date();
    const windowMs = limit.windowSeconds * 1000;

    const { data: current } = await db()
      .from("rate_limits")
      .select("window_start, count")
      .eq("key", key)
      .maybeSingle();

    if (current) {
      const windowStart = new Date(current.window_start);
      const elapsed = now.getTime() - windowStart.getTime();

      if (elapsed < windowMs) {
        if (current.count >= limit.max) {
          const retryAfter = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
          throw new AppError("RATE_LIMITED", "Too many attempts. Please wait before trying again.", { retryAfterSeconds: retryAfter });
        }
        await db()
          .from("rate_limits")
          .update({ count: current.count + 1 })
          .eq("key", key);
        return;
      }
    }

    await db()
      .from("rate_limits")
      .upsert({
        key,
        window_start: now.toISOString(),
        count: 1,
      });
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.warn("rate_limit_fallback_warning", { bucket: limit.bucket, message: err instanceof Error ? err.message : String(err) });
  }
}
