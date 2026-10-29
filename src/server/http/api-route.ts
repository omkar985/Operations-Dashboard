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

/**
 * Uniform route-handler wrapper: CSRF check, authN/authZ, body validation (Zod), error mapping.
 * Nothing sensitive is ever returned in an error body; unexpected errors are logged with a request id.
 */

const MAX_BODY_BYTES = 64 * 1024;

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "unknown";
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export interface RouteContext<B, P> {
  req: NextRequest;
  body: B;
  user: SessionUser;
  ip: string;
  params: P;
}

export interface PublicRouteContext<B, P> extends Omit<RouteContext<B, P>, "user"> {
  user: SessionUser | null;
}

type Auth = "public" | "user" | "admin";

interface Options<S extends z.ZodType | undefined> {
  auth: Auth;
  schema?: S;
}

type Body<S> = S extends z.ZodType ? z.infer<S> : undefined;

export function apiRoute<S extends z.ZodType | undefined = undefined, P = Record<string, string>>(
  options: Options<S>,
  handler: (ctx: RouteContext<Body<S>, P> & PublicRouteContext<Body<S>, P>) => Promise<NextResponse | Record<string, unknown> | void>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }): Promise<NextResponse> => {
    const requestId = crypto.randomUUID();
    try {
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

      const user =
        options.auth === "admin" ? await requireApiAdmin() : options.auth === "user" ? await requireApiUser() : null;

      let body: unknown = undefined;
      if (options.schema) {
        const type = req.headers.get("content-type") ?? "";
        if (!type.toLowerCase().startsWith("application/json")) {
          throw new AppError("BAD_REQUEST", "Content-Type must be application/json.");
        }
        const text = await req.text();
        if (text.length > MAX_BODY_BYTES) throw new AppError("BAD_REQUEST", "Request body too large.");
        let raw: unknown;
        try {
          raw = text ? JSON.parse(text) : {};
        } catch {
          throw new AppError("BAD_REQUEST", "Malformed JSON.");
        }
        const parsed = options.schema.safeParse(raw);
        if (!parsed.success) {
          throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", { fields: fieldErrors(parsed.error) });
        }
        body = parsed.data;
      }

      const params = routeCtx?.params ? await routeCtx.params : ({} as P);
      const result = await handler({ req, body: body as Body<S>, user: user as SessionUser, ip: clientIp(req), params });
      if (result instanceof NextResponse) return result;
      return json(result ?? { ok: true });
    } catch (err) {
      if (isAppError(err)) {
        const headers: Record<string, string> = { "Cache-Control": "no-store" };
        if (err.code === "RATE_LIMITED" && typeof err.details?.retryAfterSeconds === "number") {
          headers["Retry-After"] = String(err.details.retryAfterSeconds);
        }
        return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details, requestId } }, { status: err.status, headers });
      }
      await reportError(err, { requestId, method: req.method, path: req.nextUrl.pathname });
      return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again.", requestId } }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
  };
}
