import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, PROTECTED_PREFIXES, AUTH_PAGES, safeRedirectPath } from "@/lib/auth/constants";
import { verifySessionJwt } from "@/lib/auth/jwt-core";

/**
 * Next.js 16 Proxy convention (runs before page rendering).
 * Optimistically checks the JWT signature + expiration in edge/proxy runtime.
 * Authoritative DB-backed validation + session versioning still runs in DAL (requireUser).
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isProd = process.env.NODE_ENV === "production";
  const cookieName = sessionCookieName(isProd);
  const token = req.cookies.get(cookieName)?.value;

  const jwtSecret = process.env.JWT_SECRET || "";
  const jwtIssuer = process.env.JWT_ISSUER || "operations-dashboard";
  const jwtAudience = process.env.JWT_AUDIENCE || "operations-dashboard-web";

  // Check token if present
  let claims = null;
  if (token && jwtSecret.length >= 32) {
    claims = await verifySessionJwt(token, {
      secret: jwtSecret,
      issuer: jwtIssuer,
      audience: jwtAudience,
    });
  }

  const isAuthenticated = Boolean(claims);

  // Root redirect
  if (pathname === "/") {
    return NextResponse.redirect(new URL(isAuthenticated ? "/dashboard" : "/login", req.url));
  }

  // Check protected prefixes
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", req.url);
      const fullPath = `${pathname}${search}`;
      if (fullPath !== "/dashboard") {
        loginUrl.searchParams.set("next", fullPath);
      }
      return NextResponse.redirect(loginUrl);
    }

    // Role check for /admin
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      if (claims?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }
  }

  // Check auth pages
  const isAuthPage = AUTH_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`)
  );

  if (isAuthPage && isAuthenticated) {
    // If already logged in, redirect away from login/forgot-password/etc.
    const nextParam = req.nextUrl.searchParams.get("next");
    const destination = safeRedirectPath(nextParam, "/dashboard");
    return NextResponse.redirect(new URL(destination, req.url));
  }

  return NextResponse.next();
}

export const middleware = proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes (API routes handle their own auth & return JSON)
     * - static assets (.svg, .png, .jpg, .css, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)",
  ],
};
