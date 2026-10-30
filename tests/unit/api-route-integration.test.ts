import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, json } from "@/server/http/api-route";
import { createIdempotencyKey, idempotentFetch } from "@/lib/http/idempotent-fetch";
import {
  __setIdempotencyForceMemory,
  __resetIdempotencyMemoryStore,
} from "@/lib/idempotency/service";
import { __resetRateLimitMemoryStore } from "@/lib/ratelimit/limiter";

describe("API Route Pipeline Integration (Idempotency & Rate Limiting)", () => {
  beforeEach(() => {
    __setIdempotencyForceMemory(true);
    __resetIdempotencyMemoryStore();
    __resetRateLimitMemoryStore();
  });

  describe("Client Helper (idempotentFetch & createIdempotencyKey)", () => {
    it("generates RFC4122 v4 UUID idempotency keys", () => {
      const key1 = createIdempotencyKey();
      const key2 = createIdempotencyKey();

      expect(key1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(key1).not.toBe(key2);
    });

    it("attaches Idempotency-Key to mutation requests automatically", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
      global.fetch = fetchSpy;

      await idempotentFetch("http://localhost:3000/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({ email: "test@company.com" }),
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0];
      const headers = init.headers as Headers;
      expect(headers.has("Idempotency-Key")).toBe(true);
      expect(headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it("preserves explicitly provided Idempotency-Key on retries", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
      global.fetch = fetchSpy;

      const manualKey = "custom-idempotency-key-retry-1";
      await idempotentFetch("http://localhost:3000/api/admin/invitations", {
        method: "POST",
        idempotencyKey: manualKey,
      });

      const [, init] = fetchSpy.mock.calls[0];
      const headers = init.headers as Headers;
      expect(headers.get("Idempotency-Key")).toBe(manualKey);
    });
  });

  describe("apiRoute Rate Limiting Integration", () => {
    it("attaches X-RateLimit headers and enforces HTTP 429 when threshold exceeded", async () => {
      const schema = z.object({ email: z.string() });
      const handler = vi.fn().mockResolvedValue(json({ success: true }));

      const route = apiRoute(
        {
          auth: "public",
          schema,
          rateLimit: "login", // max: 5 per 15 min
          operation: "test.login",
        },
        handler
      );

      const clientIp = "192.0.2.100";

      // Make 5 permitted requests
      for (let i = 1; i <= 5; i++) {
        const req = new NextRequest("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost:3000",
            "x-forwarded-for": clientIp,
          },
          body: JSON.stringify({ email: "test@example.com" }),
        });

        const res = await route(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
        expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(5 - i));
      }

      expect(handler).toHaveBeenCalledTimes(5);

      // 6th request must be rejected with HTTP 429
      const reqBlocked = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          "x-forwarded-for": clientIp,
        },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      const resBlocked = await route(reqBlocked);
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.headers.has("Retry-After")).toBe(true);
      expect(resBlocked.headers.get("X-RateLimit-Remaining")).toBe("0");

      const bodyBlocked = await resBlocked.json();
      expect(bodyBlocked.error.code).toBe("RATE_LIMITED");

      // Handler must NOT have been called on 6th request
      expect(handler).toHaveBeenCalledTimes(5);
    });
  });

  describe("apiRoute Idempotency Integration", () => {
    it("executes handler once and replays exact response with Idempotent-Replayed header on retry", async () => {
      let executionCount = 0;
      const schema = z.object({ value: z.number() });

      const route = apiRoute(
        {
          auth: "public",
          schema,
          idempotent: true,
          operation: "test.mutation",
        },
        async ({ body }) => {
          executionCount++;
          return json({ result: body.value * 10, runIndex: executionCount }, { status: 201 });
        }
      );

      const idempotencyKey = createIdempotencyKey();
      const payload = { value: 42 };

      // First Request -> Executes
      const req1 = new NextRequest("http://localhost:3000/api/test/mutate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const res1 = await route(req1);
      expect(res1.status).toBe(201);
      expect(res1.headers.get("Idempotency-Key")).toBe(idempotencyKey);
      expect(res1.headers.get("Idempotent-Replayed")).toBeNull();

      const data1 = await res1.json();
      expect(data1).toEqual({ result: 420, runIndex: 1 });
      expect(executionCount).toBe(1);

      // Duplicate Request with exact same key & body -> Replays stored response
      const req2 = new NextRequest("http://localhost:3000/api/test/mutate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const res2 = await route(req2);
      expect(res2.status).toBe(201);
      expect(res2.headers.get("Idempotency-Key")).toBe(idempotencyKey);
      expect(res2.headers.get("Idempotent-Replayed")).toBe("true");

      const data2 = await res2.json();
      expect(data2).toEqual({ result: 420, runIndex: 1 });
      // Crucial: Handler was NOT called a second time
      expect(executionCount).toBe(1);
    });

    it("returns HTTP 409 Conflict when same Idempotency-Key is reused with different payload", async () => {
      let executionCount = 0;
      const schema = z.object({ task: z.string() });

      const route = apiRoute(
        {
          auth: "public",
          schema,
          idempotent: true,
          operation: "test.task",
        },
        async ({ body }) => {
          executionCount++;
          return json({ created: body.task });
        }
      );

      const idempotencyKey = createIdempotencyKey();

      // First request with Task A
      const reqA = new NextRequest("http://localhost:3000/api/test/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ task: "Clean Cache" }),
      });

      const resA = await route(reqA);
      expect(resA.status).toBe(200);
      expect(executionCount).toBe(1);

      // Second request reusing same key with Task B (different payload)
      const reqB = new NextRequest("http://localhost:3000/api/test/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ task: "Delete All Data" }),
      });

      const resB = await route(reqB);
      expect(resB.status).toBe(409);

      const errorBody = await resB.json();
      expect(errorBody.error.code).toBe("CONFLICT");
      expect(errorBody.error.message).toContain("different request payload");

      // Handler must NOT have been called for task B
      expect(executionCount).toBe(1);
    });
  });
});
