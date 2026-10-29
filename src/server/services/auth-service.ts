import "server-only";
import { after } from "next/server";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { burnPasswordCheck, generateToken, hashPassword, hashToken, verifyPassword } from "@/lib/auth/crypto";
import { enforceRateLimit, LIMITS } from "@/lib/auth/rate-limit";
import { endSession, startSession } from "@/lib/auth/session";
import { deliver, queuePasswordResetEmail } from "@/server/services/notification-service";
import {
  findUserByEmail,
  findUserById,
  insertUser,
  setPasswordAndRevokeSessions,
  touchLastLogin,
  bumpSessionVersion,
} from "@/server/repositories/users";
import { acceptInvitation as acceptInvitationDb, getInvitationByTokenHash } from "@/server/repositories/invitations";
import { consumePasswordReset, createPasswordReset, getResetByTokenHash, invalidateOutstandingResets } from "@/server/repositories/password-resets";
import { writeAudit } from "@/server/repositories/platform";
import type { PublicUser, UserRow } from "@/types/db";
import type { SessionUser } from "@/lib/auth/session";

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  is_active: u.is_active,
  last_login_at: u.last_login_at,
  password_changed_at: u.password_changed_at,
  created_at: u.created_at,
});

const INVALID_LOGIN = new AppError("UNAUTHENTICATED", "Invalid email or password.");

export async function login(input: { email: string; password: string; ip: string }): Promise<PublicUser> {
  await enforceRateLimit(LIMITS.loginIp, input.ip);
  await enforceRateLimit(LIMITS.loginEmail, input.email);

  const user = await findUserByEmail(input.email);
  if (!user) {
    await burnPasswordCheck(input.password);
    await writeAudit({ actorId: null, actorEmail: input.email, action: "auth.login_failed", metadata: { reason: "unknown_user" }, ip: input.ip });
    throw INVALID_LOGIN;
  }
  const ok = await verifyPassword(input.password, user.password_hash);
  if (!ok) {
    await writeAudit({ actorId: user.id, actorEmail: user.email, action: "auth.login_failed", metadata: { reason: "bad_password" }, ip: input.ip });
    throw INVALID_LOGIN;
  }
  if (!user.is_active) {
    await writeAudit({ actorId: user.id, actorEmail: user.email, action: "auth.login_blocked", metadata: { reason: "inactive" }, ip: input.ip });
    throw new AppError("FORBIDDEN", "This account has been deactivated. Contact an administrator.");
  }

  await startSession(user);
  await touchLastLogin(user.id);
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "auth.login", ip: input.ip });
  return toPublicUser(user);
}

export async function logout(user: SessionUser | null, ip: string): Promise<void> {
  await endSession();
  if (user) await writeAudit({ actorId: user.id, actorEmail: user.email, action: "auth.logout", ip });
}

/** Revokes every session of this user (all devices), including the current one. */
export async function signOutEverywhere(user: SessionUser, ip: string): Promise<void> {
  await bumpSessionVersion(user.id);
  await endSession();
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "auth.sign_out_everywhere", ip });
}

/**
 * Always resolves the same way whether or not the email exists (no account enumeration).
 * The email is delivered after the response is sent, so timing does not leak either.
 */
export async function requestPasswordReset(input: { email: string; ip: string }): Promise<void> {
  await enforceRateLimit(LIMITS.forgotIp, input.ip);
  await enforceRateLimit(LIMITS.forgotEmail, input.email);

  const user = await findUserByEmail(input.email);
  if (!user || !user.is_active) return;

  const raw = generateToken();
  const expiresAt = new Date(Date.now() + getEnv().PASSWORD_RESET_TTL_MINUTES * 60_000);
  await invalidateOutstandingResets(user.id);
  await createPasswordReset({ userId: user.id, tokenHash: hashToken(raw), expiresAt, ip: input.ip });
  const note = await queuePasswordResetEmail(user, raw, expiresAt);
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "auth.password_reset_requested", ip: input.ip });
  after(async () => {
    await deliver(note.id);
  });
}

export async function resetPassword(input: { token: string; password: string; ip: string }): Promise<void> {
  await enforceRateLimit(LIMITS.resetIp, input.ip);
  const passwordHash = await hashPassword(input.password);
  const userId = await consumePasswordReset(hashToken(input.token), passwordHash);
  const user = await findUserById(userId);
  await writeAudit({ actorId: userId, actorEmail: user?.email ?? null, action: "auth.password_reset_completed", ip: input.ip });
}

export async function acceptInvitation(input: { token: string; name: string; password: string; ip: string }): Promise<PublicUser> {
  await enforceRateLimit(LIMITS.acceptIp, input.ip);
  const passwordHash = await hashPassword(input.password);
  const user = await acceptInvitationDb(hashToken(input.token), input.name, passwordHash);
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "invitation.accepted", targetType: "user", targetId: user.id, ip: input.ip });
  return toPublicUser(user);
}

export async function changePassword(input: { user: SessionUser; currentPassword: string; newPassword: string; ip: string }): Promise<void> {
  await enforceRateLimit(LIMITS.passwordChange, input.user.id);
  const row = await findUserById(input.user.id);
  if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
    throw new AppError("VALIDATION_FAILED", "Your current password is incorrect.", { fields: { currentPassword: "Incorrect password" } });
  }
  const hash = await hashPassword(input.newPassword);
  const nextVersion = await setPasswordAndRevokeSessions(row.id, hash, row.session_version);
  // All other devices are now signed out; keep this one signed in with a fresh token.
  await startSession({ ...row, session_version: nextVersion });
  await writeAudit({ actorId: row.id, actorEmail: row.email, action: "auth.password_changed", ip: input.ip });
}

// ---- read-only token inspection for the landing pages (does NOT consume anything) ----

export type TokenInspection =
  | { valid: true; email?: string; role?: "ADMIN" | "USER" }
  | { valid: false; reason: "invalid" | "expired" | "used" | "revoked" };

export async function inspectInvitationToken(token: string | undefined): Promise<TokenInspection> {
  if (!token) return { valid: false, reason: "invalid" };
  const inv = await getInvitationByTokenHash(hashToken(token));
  if (!inv) return { valid: false, reason: "invalid" };
  if (inv.status === "revoked") return { valid: false, reason: "revoked" };
  if (inv.status === "accepted") return { valid: false, reason: "used" };
  if (new Date(inv.expires_at) <= new Date()) return { valid: false, reason: "expired" };
  return { valid: true, email: inv.email, role: inv.role };
}

export async function inspectResetToken(token: string | undefined): Promise<TokenInspection> {
  if (!token) return { valid: false, reason: "invalid" };
  const r = await getResetByTokenHash(hashToken(token));
  if (!r) return { valid: false, reason: "invalid" };
  if (r.used_at) return { valid: false, reason: "used" };
  if (new Date(r.expires_at) <= new Date()) return { valid: false, reason: "expired" };
  return { valid: true };
}

/** Used only by the documented bootstrap script (never reachable over HTTP). */
export async function createBootstrapAdmin(input: { email: string; name: string; password: string }): Promise<UserRow> {
  return insertUser({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password), role: "ADMIN" });
}
