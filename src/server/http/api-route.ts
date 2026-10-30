import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError, isAppError } from "@/lib/errors";
import { fieldErrors } from "@/lib/validation/schemas";
import { reportError } from "@/lib/logger";
import { appOrigin, isProduction } from "@/lib/env";
import { isRequestSameOrigin } from "@/lib/auth/csrf";
import { requireApiAdmin, requireApiUser } from "@/lib/auth/dal";
import type { SessionUser } from "@/lib/auth/session";
import {
  type RateLimitCategory,
  type RateLimitResult,
} from "@/lib/ratelimit/types";
import { enforceRateLimit } from "@/lib/ratelimit/limiter";
import { computeRequestFingerprint } from "@/lib/idempotency/fingerprint";
import {
  beginIdempotency,
  finishIdempotency,
  failIdempotency,
} from "@/lib/idempotency/service";

/**
 * Uniform, production-ready route-handler wrapper:
 *  - CSRF check (same origin validation)
 *  - Distributed sliding-window rate limiting (Upstash Redis + durable Postgres fallback)
 *  - Strict authentication & authorization (Admin / User / Public)
 *  - Payload validation (Zod)
 *  - Database-backed Idempotency (prevent duplicate mutations, replaying completed responses)
 *  - Consistent error mapping and safe diagnostic logging
 */

const MAX_BODY_BYTES = 64 * 1024;

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "unknown";
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export interface RouteContext<B, P> {
  req: NextRequest;
  body: B;
  user: SessionUser;
  ip: string;
  params: P;
  idempotencyKey?: string | null;
}

export interface PublicRouteContext<B, P> extends Omit<RouteContext<B, P>, "user"> {
  user: SessionUser | null;
}

type Auth = "public" | "user" | "admin";

interface Options<S extends z.ZodType | undefined> {
  auth: Auth;
  schema?: S;
  rateLimit?: RateLimitCategory;
  idempotent?: boolean;
  operation?: string;
}

type Body<S> = S extends z.ZodType ? z.infer<S> : undefined;

export function apiRoute<
  S extends z.ZodType | undefined = undefined,
  P = Record<string, string>
>(
  options: Options<S>,
  handler: (
    ctx: RouteContext<Body<S>, P> & PublicRouteContext<Body<S>, P>
  ) => Promise<NextResponse | Record<string, unknown> | void>
) {
  return async (
    req: NextRequest,
    routeCtx?: { params?: Promise<P> }
  ): Promise<NextResponse> => {
    const requestId = crypto.randomUUID();
    const ip = clientIp(req);
    let rateLimitResult: RateLimitResult | undefined;

    let idempotencyKey: string | null = null;
    let idempotencyScope: string | null = null;
    let idempotencyStarted = false;

    try {
      // 1. CSRF same-origin check
      if (
        !isRequestSameOrigin({
          method: req.method,
          origin: req.headers.get("origin"),
          secFetchSite: req.headers.get("sec-fetch-site"),
          host: req.headers.get("host"),
          appOrigin: appOrigin(),
          isProd: isProduction(),
        })
      ) {
        throw new AppError("CSRF_REJECTED", "Cross-site request rejected.");
      }

      // 2. Authentication & Authorization MUST happen before checking/replaying idempotency
      const user =
        options.auth === "admin"
          ? await requireApiAdmin()
          : options.auth === "user"
          ? await requireApiUser()
          : null;

      // 3. Rate limiting enforcement
      if (options.rateLimit) {
        rateLimitResult = await enforceRateLimit({
          category: options.rateLimit,
          ip,
          userId: user?.id,
        });
      }

      // 4. Request body extraction & validation
      let body: unknown = undefined;
      if (options.schema) {
        const type = req.headers.get("content-type") ?? "";
        if (!type.toLowerCase().startsWith("application/json")) {
          throw new AppError("BAD_REQUEST", "Content-Type must be application/json.");
        }
        const text = await req.text();
        if (text.length > MAX_BODY_BYTES) {
          throw new AppError("BAD_REQUEST", "Request body too large.");
        }
        let raw: unknown;
        try {
          raw = text ? JSON.parse(text) : {};
        } catch {
          throw new AppError("BAD_REQUEST", "Malformed JSON.");
        }
        const parsed = options.schema.safeParse(raw);
        if (!parsed.success) {
          throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
            fields: fieldErrors(parsed.error),
          });
        }
        body = parsed.data;
      }

      const params = routeCtx?.params ? await routeCtx.params : ({} as P);

      // 5. Centralized Idempotency for POST, PUT, PATCH, DELETE operations
      const isMutationMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(
        req.method.toUpperCase()
      );
      const rawKey =
        req.headers.get("idempotency-key") ||
        req.headers.get("x-idempotency-key");

      if (rawKey && (options.idempotent || isMutationMethod)) {
        idempotencyKey = rawKey.trim().slice(0, 255);
        idempotencyScope = user ? `user:${user.id}` : `anon:${ip}`;
        const operation =
          options.operation || `${req.method.toUpperCase()} ${req.nextUrl.pathname}`;

        const requestHash = computeRequestFingerprint({
          method: req.method,
          pathname: req.nextUrl.pathname,
          searchParams: req.nextUrl.searchParams,
          body,
        });

        const idempBegin = await beginIdempotency({
          key: idempotencyKey,
          scope: idempotencyScope,
          userId: user?.id,
          operation,
          requestHash,
        });

        if (idempBegin.action === "conflict_mismatch") {
          throw new AppError(
            "CONFLICT",
            "Idempotency key reused with different request payload."
          );
        }

        if (idempBegin.action === "conflict_in_progress") {
          throw new AppError(
            "CONFLICT",
            "An identical request is currently in progress. Please retry shortly.",
            { retryAfterSeconds: 2 }
          );
        }

        if (idempBegin.action === "replay" && idempBegin.cachedResponse) {
          const replayHeaders: Record<string, string> = {
            "Cache-Control": "no-store",
            "Idempotent-Replayed": "true",
            "Idempotency-Key": idempotencyKey,
            ...idempBegin.cachedResponse.headers,
          };

          if (rateLimitResult) {
            replayHeaders["X-RateLimit-Limit"] = String(rateLimitResult.limit);
            replayHeaders["X-RateLimit-Remaining"] = String(rateLimitResult.remaining);
            replayHeaders["X-RateLimit-Reset"] = String(rateLimitResult.reset);
          }

          return NextResponse.json(idempBegin.cachedResponse.body, {
            status: idempBegin.cachedResponse.status,
            headers: replayHeaders,
          });
        }

        idempotencyStarted = true;
      }

      // 6. Execute Handler
      const result = await handler({
        req,
        body: body as Body<S>,
        user: user as SessionUser,
        ip,
        params,
        idempotencyKey,
      });

      // 7. Format Response and Attach Rate Limit Headers
      let finalResponse: NextResponse;
      let statusCode = 200;
      let responseBodyForCache: unknown = null;

      if (result instanceof NextResponse) {
        finalResponse = result;
        statusCode = result.status;
        try {
          responseBodyForCache = await result.clone().json();
        } catch {
          responseBodyForCache = null;
        }
      } else {
        statusCode = 200;
        responseBodyForCache = result ?? { ok: true };
        finalResponse = json(responseBodyForCache);
      }

      // Attach rate limit headers
      if (rateLimitResult) {
        finalResponse.headers.set("X-RateLimit-Limit", String(rateLimitResult.limit));
        finalResponse.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
        finalResponse.headers.set("X-RateLimit-Reset", String(rateLimitResult.reset));
      }

      // Attach Idempotency-Key confirmation header
      if (idempotencyKey) {
        finalResponse.headers.set("Idempotency-Key", idempotencyKey);
      }

      // 8. Finalize Idempotency Record on Success
      if (idempotencyStarted && idempotencyKey && idempotencyScope) {
        await finishIdempotency({
          key: idempotencyKey,
          scope: idempotencyScope,
          statusCode,
          headers: {
            "content-type": finalResponse.headers.get("content-type") || "application/json",
          },
          body: responseBodyForCache,
        });
      }

      return finalResponse;
    } catch (err) {
      // Record failed idempotency attempt so subsequent retries are safe
      if (idempotencyStarted && idempotencyKey && idempotencyScope) {
        await failIdempotency({
          key: idempotencyKey,
          scope: idempotencyScope,
          error: err instanceof Error ? err.message : String(err),
        }).catch(() => {});
      }

      if (isAppError(err)) {
        const headers: Record<string, string> = { "Cache-Control": "no-store" };

        if (err.code === "RATE_LIMITED") {
          const retryAfter =
            typeof err.details?.retryAfterSeconds === "number"
              ? err.details.retryAfterSeconds
              : 60;
          headers["Retry-After"] = String(retryAfter);

          if (err.details?.limit) headers["X-RateLimit-Limit"] = String(err.details.limit);
          if (err.details?.remaining !== undefined) {
            headers["X-RateLimit-Remaining"] = String(err.details.remaining);
          }
          if (err.details?.reset) headers["X-RateLimit-Reset"] = String(err.details.reset);
        } else if (err.code === "CONFLICT" && typeof err.details?.retryAfterSeconds === "number") {
          headers["Retry-After"] = String(err.details.retryAfterSeconds);
        }

        return NextResponse.json(
          {
            error: {
              code: err.code,
              message: err.message,
              details: err.details,
              requestId,
            },
          },
          { status: err.status, headers }
        );
      }

      await reportError(err, {
        requestId,
        method: req.method,
        path: req.nextUrl.pathname,
      });

      return NextResponse.json(
        {
          error: {
            code: "INTERNAL",
            message: "Something went wrong. Please try again.",
            requestId,
          },
        },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }
  };
}
