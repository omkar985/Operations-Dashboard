import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getEnv, isProduction } from "@/lib/env";
import { sessionCookieName } from "@/lib/auth/constants";
import { signSessionJwt, verifySessionJwt, type JwtConfig } from "@/lib/auth/jwt-core";
import { findUserById } from "@/server/repositories/users";
import type { UserRole, UserRow } from "@/types/db";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Always taken from the database record, never from the token. */
  role: UserRole;
}

export function jwtConfig(): JwtConfig {
  const e = getEnv();
  return { secret: e.JWT_SECRET, issuer: e.JWT_ISSUER, audience: e.JWT_AUDIENCE };
}

/**
 * Resolves the signed-in user for the current request.
 *
 * Two independent checks must both pass:
 *  1. the JWT is authentic, unexpired, and bound to our issuer/audience;
 *  2. the authoritative DB row exists, is active, and its `session_version` equals the token's `sv`.
 * Bumping `session_version` (password change, deactivation, role change, "sign out everywhere")
 * therefore revokes every outstanding token on the very next request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(sessionCookieName(isProduction()))?.value;
  const claims = await verifySessionJwt(token, jwtConfig());
  if (!claims) return null;
  const user = await findUserById(claims.sub);
  if (!user || !user.is_active || user.session_version !== claims.sv) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
});

export async function startSession(user: UserRow): Promise<void> {
  const ttl = getEnv().SESSION_TTL_HOURS * 3600;
  const token = await signSessionJwt({ sub: user.id, email: user.email, role: user.role, sv: user.session_version }, ttl, jwtConfig());
  const jar = await cookies();
  jar.set(sessionCookieName(isProduction()), token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.set(sessionCookieName(isProduction()), "", { httpOnly: true, secure: isProduction(), sameSite: "lax", path: "/", maxAge: 0 });
}
