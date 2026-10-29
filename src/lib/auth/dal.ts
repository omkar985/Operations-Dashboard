import "server-only";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";

/**
 * Data Access Layer guards. Authorization is enforced HERE, close to the data, in addition to the
 * optimistic redirect done by src/proxy.ts. Never rely on client-supplied roles.
 */

/** For pages / layouts. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?reason=session");
  return user;
}

export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/** For route handlers: throw typed errors that the API wrapper converts to JSON. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  return user;
}

export async function requireApiAdmin(): Promise<SessionUser> {
  const user = await requireApiUser();
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "Administrator access is required.");
  return user;
}
