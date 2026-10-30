import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  computeRequestFingerprint,
  canonicalJsonString,
} from "@/lib/idempotency/fingerprint";
import {
  beginIdempotency,
  finishIdempotency,
  failIdempotency,
  purgeExpiredIdempotencyKeys,
  __setIdempotencyForceMemory,
  __resetIdempotencyMemoryStore,
} from "@/lib/idempotency/service";

describe("Production Idempotency Core", () => {
  beforeEach(() => {
    __setIdempotencyForceMemory(true);
    __resetIdempotencyMemoryStore();
  });

  describe("Request Fingerprinting & Canonical JSON", () => {
    it("produces identical SHA-256 fingerprints regardless of object key order", () => {
      const payloadA = { b: 2, a: 1, c: { z: 26, y: 25 } };
      const payloadB = { a: 1, c: { y: 25, z: 26 }, b: 2 };

      const fpA = computeRequestFingerprint({ method: "POST", pathname: "/api/admin/invitations", body: payloadA });
      const fpB = computeRequestFingerprint({ method: "POST", pathname: "/api/admin/invitations", body: payloadB });

      expect(fpA).toBe(fpB);
      expect(fpA).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different fingerprints for different payloads, methods, or paths", () => {
      const base = computeRequestFingerprint({ method: "POST", pathname: "/api/data/refresh", body: { force: true } });
      const diffPayload = computeRequestFingerprint({ method: "POST", pathname: "/api/data/refresh", body: { force: false } });
      const diffMethod = computeRequestFingerprint({ method: "PUT", pathname: "/api/data/refresh", body: { force: true } });
      const diffPath = computeRequestFingerprint({ method: "POST", pathname: "/api/admin/settings/refresh", body: { force: true } });

      expect(base).not.toBe(diffPayload);
      expect(base).not.toBe(diffMethod);
      expect(base).not.toBe(diffPath);
    });

    it("handles null, undefined, primitives, and arrays consistently", () => {
      expect(canonicalJsonString(null)).toBe("");
      expect(canonicalJsonString(undefined)).toBe("");
      expect(canonicalJsonString("hello")).toBe('"hello"');
      expect(canonicalJsonString([3, 2, 1])).toBe("[3,2,1]");
      expect(
        canonicalJsonString([{ b: 1, a: 2 }, { d: 3, c: 4 }])
      ).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
    });
  });

  describe("Idempotency Lifecycle & State Transitions", () => {
    const scope = "user:admin-123";
    const operation = "admin.invitations.create";
    const key = "550e8400-e29b-41d4-a716-446655440000";
    const payload = { email: "newhire@company.com", role: "VIEWER" };
    const requestHash = computeRequestFingerprint({
      method: "POST",
      pathname: "/api/admin/invitations",
      body: payload,
    });

    it("claims key on first attempt and executes", async () => {
      const result = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
      });

      expect(result.action).toBe("execute");
    });

    it("replays cached response when an already-completed operation is repeated", async () => {
      // 1. Initial claim
      const initial = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
      });
      expect(initial.action).toBe("execute");

      // 2. Mark completed
      const originalResponse = {
        statusCode: 201,
        headers: { "content-type": "application/json" },
        body: { id: "inv_123", email: "newhire@company.com", status: "pending" },
      };
      await finishIdempotency({
        key,
        scope,
        ...originalResponse,
      });

      // 3. Repeat request with same key and identical payload
      const repeated = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
      });

      expect(repeated.action).toBe("replay");
      expect(repeated.cachedResponse).toBeDefined();
      expect(repeated.cachedResponse?.status).toBe(201);
      expect(repeated.cachedResponse?.body).toEqual(originalResponse.body);
    });

    it("returns conflict_mismatch (HTTP 409) if the same key is reused with a different payload", async () => {
      // 1. Initial claim with payload A
      await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
      });

      await finishIdempotency({
        key,
        scope,
        statusCode: 200,
        headers: {},
        body: { ok: true },
      });

      // 2. Re-use key with payload B
      const differentPayload = { email: "attacker@evil.com", role: "ADMIN" };
      const differentHash = computeRequestFingerprint({
        method: "POST",
        pathname: "/api/admin/invitations",
        body: differentPayload,
      });

      const conflict = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash: differentHash,
      });

      expect(conflict.action).toBe("conflict_mismatch");
    });

    it("returns conflict_in_progress when concurrent duplicate request arrives", async () => {
      // 1. First request starts
      const first = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
        leaseSeconds: 60,
      });
      expect(first.action).toBe("execute");

      // 2. Concurrent second request with same key arrives while first is in-progress
      const concurrent = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
        leaseSeconds: 60,
      });

      expect(concurrent.action).toBe("conflict_in_progress");
    });

    it("reclaims lock when lease expires on an abandoned in-progress operation", async () => {
      vi.useFakeTimers();
      const t0 = new Date("2026-10-30T12:00:00Z").getTime();
      vi.setSystemTime(t0);

      // 1. First request starts with a 60-second lease
      const first = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
        leaseSeconds: 60,
      });
      expect(first.action).toBe("execute");

      // 2. Within lease window (e.g. 10s later), concurrent attempt is rejected
      vi.advanceTimersByTime(10_000);
      const concurrent = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
        leaseSeconds: 60,
      });
      expect(concurrent.action).toBe("conflict_in_progress");

      // 3. After lease expires (> 60s total), next attempt reclaims lock and executes
      vi.advanceTimersByTime(55_000);
      const reclaimed = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
        leaseSeconds: 60,
      });

      expect(reclaimed.action).toBe("execute");
      vi.useRealTimers();
    });

    it("allows retry when an operation previously failed", async () => {
      // 1. Start operation
      await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
      });

      // 2. Operation fails (e.g. downstream network outage)
      await failIdempotency({
        key,
        scope,
        error: "Google Sheets API returned 503 Service Unavailable",
      });

      // 3. Client retries with same idempotency key
      const retry = await beginIdempotency({
        key,
        scope,
        userId: "admin-123",
        operation,
        requestHash,
      });

      expect(retry.action).toBe("execute");
    });

    it("isolates idempotency keys across different users and scopes", async () => {
      const userA = "user:tenant-alpha";
      const userB = "user:tenant-beta";
      const sharedKey = "shared-uuid-key-111";

      // Tenant Alpha executes
      const firstA = await beginIdempotency({
        key: sharedKey,
        scope: userA,
        userId: "tenant-alpha",
        operation,
        requestHash,
      });
      expect(firstA.action).toBe("execute");

      await finishIdempotency({
        key: sharedKey,
        scope: userA,
        statusCode: 200,
        headers: {},
        body: { tenant: "alpha" },
      });

      // Tenant Beta using same key must execute independently, NOT replay Alpha's data
      const firstB = await beginIdempotency({
        key: sharedKey,
        scope: userB,
        userId: "tenant-beta",
        operation,
        requestHash,
      });
      expect(firstB.action).toBe("execute");
    });

    it("purges expired idempotency records", async () => {
      // Create completed key
      await beginIdempotency({
        key: "old-key-to-expire",
        scope,
        operation,
        requestHash,
      });
      await finishIdempotency({
        key: "old-key-to-expire",
        scope,
        statusCode: 200,
        headers: {},
        body: { ok: true },
      });

      // Purge records older than 0 seconds
      const purgedCount = await purgeExpiredIdempotencyKeys(0);
      expect(purgedCount).toBeGreaterThanOrEqual(1);

      // Subsequent call should execute fresh rather than replaying
      const fresh = await beginIdempotency({
        key: "old-key-to-expire",
        scope,
        operation,
        requestHash,
      });
      expect(fresh.action).toBe("execute");
    });
  });
});
