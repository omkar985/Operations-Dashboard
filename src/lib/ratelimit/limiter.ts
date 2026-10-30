import "server-only";
import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getUpstashConfig, isProduction, isRateLimitFailClosed } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { db } from "@/lib/supabase/admin";
import {
  type RateLimitCategory,
  type RateLimitResult,
  RATE_LIMIT_POLICIES,
} from "./types";

/**
 * Production-ready distributed sliding-window rate limiting.
 *
 * Primary: Upstash Redis with @upstash/ratelimit (sliding window algorithm).
 * Resilient Backup (production): Durable Postgres table (`rate_limits`) so limits hold across
 * serverless instances without ever falling back to volatile process memory.
 * Fail-Closed: Sensitive operations refuse traffic if security infrastructure is down.
 */

const hashKey = (val: string) =>
  createHash("sha256").update(val).digest("hex").slice(0, 32);

// Cached Upstash Ratelimit instances per category
let upstashClient: Redis | null = null;
const upstashLimiters = new Map<RateLimitCategory, Ratelimit>();

function getUpstashLimiter(category: RateLimitCategory): Ratelimit | null {
  const config = getUpstashConfig();
  if (!config) return null;

  if (!upstashClient) {
    upstashClient = new Redis({
      url: config.url,
      token: config.token,
    });
  }

  let limiter = upstashLimiters.get(category);
  if (!limiter) {
    const policy = RATE_LIMIT_POLICIES[category];
    limiter = new Ratelimit({
      redis: upstashClient,
      limiter: Ratelimit.slidingWindow(policy.max, policy.upstashWindow),
      prefix: `od:rl:${category}`,
      analytics: false,
    });
    upstashLimiters.set(category, limiter);
  }

  return limiter;
}

// In-memory sliding window cache for non-production development/test runs only
interface MemoryEntry {
  timestamps: number[];
}
const devMemoryStore = new Map<string, MemoryEntry>();

function devSlidingWindowLimit(
  key: string,
  category: RateLimitCategory
): RateLimitResult {
  const policy = RATE_LIMIT_POLICIES[category];
  const now = Date.now();
  const windowMs = policy.windowSeconds * 1000;
  const cutoff = now - windowMs;

  let entry = devMemoryStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    devMemoryStore.set(key, entry);
  }

  // Filter timestamps outside current window
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

  const limit = policy.max;
  const currentCount = entry.timestamps.length;
  const success = currentCount < limit;

  if (success) {
    entry.timestamps.push(now);
  }

  const oldest = entry.timestamps[0] || now;
  const resetMs = oldest + windowMs;
  const remaining = Math.max(0, limit - entry.timestamps.length);
  const retryAfterSeconds = success
    ? 0
    : Math.max(1, Math.ceil((resetMs - now) / 1000));

  return {
    success,
    limit,
    remaining,
    reset: resetMs,
    retryAfterSeconds,
    category,
  };
}

/**
 * Durable Postgres-backed rate limiting fallback (serverless-safe, durable across instances).
 */
async function postgresRateLimitFallback(
  key: string,
  category: RateLimitCategory
): Promise<RateLimitResult> {
  const policy = RATE_LIMIT_POLICIES[category];
  const now = new Date();
  const windowMs = policy.windowSeconds * 1000;

  try {
    // 1. Attempt atomic RPC if available
    const rpcRes = await db().rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: policy.windowSeconds,
      p_max: policy.max,
    });

    if (!rpcRes.error && rpcRes.data) {
      const row = (Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data) as {
        allowed: boolean;
        remaining: number;
        retry_after_seconds: number;
      };
      return {
        success: Boolean(row.allowed),
        limit: policy.max,
        remaining: row.remaining ?? 0,
        reset: Date.now() + (row.retry_after_seconds || policy.windowSeconds) * 1000,
        retryAfterSeconds: row.retry_after_seconds || 0,
        category,
      };
    }

    // 2. Direct table fallback
    const { data: current } = await db()
      .from("rate_limits")
      .select("window_start, count")
      .eq("key", key)
      .maybeSingle();

    if (current) {
      const windowStart = new Date(current.window_start).getTime();
      const elapsed = now.getTime() - windowStart;

      if (elapsed < windowMs) {
        const count = current.count;
        const allowed = count < policy.max;
        const remaining = Math.max(0, policy.max - (count + 1));
        const retryAfterSeconds = allowed
          ? 0
          : Math.max(1, Math.ceil((windowMs - elapsed) / 1000));

        if (allowed) {
          await db()
            .from("rate_limits")
            .update({ count: count + 1 })
            .eq("key", key);
        }

        return {
          success: allowed,
          limit: policy.max,
          remaining,
          reset: windowStart + windowMs,
          retryAfterSeconds,
          category,
        };
      }
    }

    // New window
    await db().from("rate_limits").upsert({
      key,
      window_start: now.toISOString(),
      count: 1,
    });

    return {
      success: true,
      limit: policy.max,
      remaining: policy.max - 1,
      reset: now.getTime() + windowMs,
      retryAfterSeconds: 0,
      category,
    };
  } catch (err) {
    log.error("postgres_ratelimit_error", {
      category,
      key,
      error: err instanceof Error ? err.message : String(err),
    });

    if (isRateLimitFailClosed()) {
      return {
        success: false,
        limit: policy.max,
        remaining: 0,
        reset: Date.now() + policy.windowSeconds * 1000,
        retryAfterSeconds: Math.min(60, policy.windowSeconds),
        category,
      };
    }

    // Permissive fallback only when fail-closed is explicitly disabled
    return {
      success: true,
      limit: policy.max,
      remaining: 1,
      reset: Date.now() + policy.windowSeconds * 1000,
      retryAfterSeconds: 0,
      category,
    };
  }
}

export interface CheckRateLimitParams {
  category: RateLimitCategory;
  ip: string;
  userId?: string | null;
  email?: string | null;
}

/**
 * Checks a rate limit against the distributed sliding window.
 */
export async function checkRateLimit({
  category,
  ip,
  userId,
  email,
}: CheckRateLimitParams): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter(category);

  // Derive unique identifier: userId takes precedence, then hashed email, then client IP
  const primaryId = userId ? `u:${userId}` : email ? `e:${hashKey(email)}` : `ip:${hashKey(ip)}`;
  const identifier = `${category}:${primaryId}`;

  // 1. Try Upstash Redis if configured
  if (limiter) {
    try {
      const res = await limiter.limit(identifier);
      const retryAfterSeconds = res.success
        ? 0
        : Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));

      return {
        success: res.success,
        limit: res.limit,
        remaining: res.remaining,
        reset: res.reset,
        retryAfterSeconds,
        category,
      };
    } catch (err) {
      log.warn("upstash_ratelimit_failed", {
        category,
        identifier,
        error: err instanceof Error ? err.message : String(err),
      });

      // If Redis has an outage in production, use durable Postgres rate limiter
      if (isProduction()) {
        return postgresRateLimitFallback(identifier, category);
      }
    }
  }

  // 2. In Production without Upstash credentials, use durable Postgres (never in-memory)
  if (isProduction()) {
    return postgresRateLimitFallback(identifier, category);
  }

  // 3. In non-production testing/development, use local sliding window
  return devSlidingWindowLimit(identifier, category);
}

/**
 * Enforces rate limit and throws an HTTP 429 AppError if exceeded.
 */
export async function enforceRateLimit(
  params: CheckRateLimitParams
): Promise<RateLimitResult> {
  const result = await checkRateLimit(params);

  if (!result.success) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests. Please wait before trying again.",
      {
        retryAfterSeconds: result.retryAfterSeconds,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
        category: params.category,
      }
    );
  }

  return result;
}

/**
 * Resets memory store for unit testing.
 */
export function __resetRateLimitMemoryStore() {
  devMemoryStore.clear();
}
