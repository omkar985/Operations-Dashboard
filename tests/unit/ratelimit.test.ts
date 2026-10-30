import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkRateLimit,
  enforceRateLimit,
  __resetRateLimitMemoryStore,
} from "@/lib/ratelimit/limiter";
import { RATE_LIMIT_POLICIES } from "@/lib/ratelimit/types";
import { AppError } from "@/lib/errors";

describe("Distributed Rate Limiting (Sliding Window)", () => {
  beforeEach(() => {
    __resetRateLimitMemoryStore();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defines policies matching required production specifications", () => {
    expect(RATE_LIMIT_POLICIES.login).toMatchObject({
      max: 5,
      windowSeconds: 900,
      upstashWindow: "15 m",
    });
    expect(RATE_LIMIT_POLICIES.passwordReset).toMatchObject({
      max: 3,
      windowSeconds: 900,
      upstashWindow: "15 m",
    });
    expect(RATE_LIMIT_POLICIES.invitationCreate).toMatchObject({
      max: 5,
      windowSeconds: 3600,
      upstashWindow: "1 h",
    });
    expect(RATE_LIMIT_POLICIES.invitationResend).toMatchObject({
      max: 3,
      windowSeconds: 900,
      upstashWindow: "15 m",
    });
    expect(RATE_LIMIT_POLICIES.generalApi).toMatchObject({
      max: 120,
      windowSeconds: 60,
      upstashWindow: "1 m",
    });
    expect(RATE_LIMIT_POLICIES.dataRefresh).toMatchObject({
      max: 5,
      windowSeconds: 300,
      upstashWindow: "5 m",
    });
    expect(RATE_LIMIT_POLICIES.adminMutation).toMatchObject({
      max: 30,
      windowSeconds: 60,
      upstashWindow: "1 m",
    });
  });

  it("enforces login rate limit (5 attempts per 15 minutes)", async () => {
    const ip = "192.168.1.10";

    for (let i = 1; i <= 5; i++) {
      const res = await checkRateLimit({
        category: "login",
        ip,
        email: "admin@example.com",
      });
      expect(res.success).toBe(true);
      expect(res.limit).toBe(5);
      expect(res.remaining).toBe(5 - i);
      expect(res.retryAfterSeconds).toBe(0);
    }

    // 6th attempt should be blocked
    const blocked = await checkRateLimit({
      category: "login",
      ip,
      email: "admin@example.com",
    });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(900);
  });

  it("enforces password reset limit (3 attempts per 15 minutes)", async () => {
    const email = "forgot@company.com";

    for (let i = 1; i <= 3; i++) {
      const res = await checkRateLimit({
        category: "passwordReset",
        ip: "10.0.0.1",
        email,
      });
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(3 - i);
    }

    const blocked = await checkRateLimit({
      category: "passwordReset",
      ip: "10.0.0.1",
      email,
    });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("enforces manual data refresh limit (5 attempts per 5 minutes)", async () => {
    const userId = "user-analyst-1";

    for (let i = 1; i <= 5; i++) {
      const res = await checkRateLimit({
        category: "dataRefresh",
        ip: "127.0.0.1",
        userId,
      });
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(5 - i);
    }

    const blocked = await checkRateLimit({
      category: "dataRefresh",
      ip: "127.0.0.1",
      userId,
    });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(300);
  });

  it("isolates rate limits between different users on the same NAT / IP", async () => {
    const sharedIp = "203.0.113.195";

    // User A hits their limit (5 invitations)
    for (let i = 0; i < 5; i++) {
      const resA = await checkRateLimit({
        category: "invitationCreate",
        ip: sharedIp,
        userId: "admin-alice",
      });
      expect(resA.success).toBe(true);
    }

    const blockedA = await checkRateLimit({
      category: "invitationCreate",
      ip: sharedIp,
      userId: "admin-alice",
    });
    expect(blockedA.success).toBe(false);

    // User B on the same IP must NOT be blocked
    const resB = await checkRateLimit({
      category: "invitationCreate",
      ip: sharedIp,
      userId: "admin-bob",
    });
    expect(resB.success).toBe(true);
    expect(resB.remaining).toBe(4);
  });

  it("allows requests again after sliding window expires", async () => {
    vi.useFakeTimers();
    const startTime = new Date("2026-10-30T12:00:00Z").getTime();
    vi.setSystemTime(startTime);

    const ip = "198.51.100.5";

    // Fill generalApi quota: 120 per minute
    for (let i = 0; i < 120; i++) {
      const res = await checkRateLimit({
        category: "generalApi",
        ip,
      });
      expect(res.success).toBe(true);
    }

    // 121st request is blocked
    const blocked = await checkRateLimit({
      category: "generalApi",
      ip,
    });
    expect(blocked.success).toBe(false);

    // Advance time by 61 seconds (past the 1-minute sliding window)
    vi.advanceTimersByTime(61_000);

    const allowedAgain = await checkRateLimit({
      category: "generalApi",
      ip,
    });
    expect(allowedAgain.success).toBe(true);
    expect(allowedAgain.remaining).toBe(119);
  });

  it("enforceRateLimit throws AppError with HTTP 429 semantics when exceeded", async () => {
    const ip = "172.16.0.42";

    // Exhaust 3 password resets
    for (let i = 0; i < 3; i++) {
      await enforceRateLimit({
        category: "passwordReset",
        ip,
      });
    }

    // Next must throw
    await expect(
      enforceRateLimit({
        category: "passwordReset",
        ip,
      })
    ).rejects.toThrow(AppError);

    try {
      await enforceRateLimit({
        category: "passwordReset",
        ip,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe("RATE_LIMITED");
      expect(appErr.status).toBe(429);
      expect(appErr.details).toHaveProperty("retryAfterSeconds");
      expect(appErr.details).toHaveProperty("limit", 3);
      expect(appErr.details).toHaveProperty("remaining", 0);
    }
  });
});
