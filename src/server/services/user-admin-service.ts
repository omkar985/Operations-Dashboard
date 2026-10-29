import "server-only";
import { AppError } from "@/lib/errors";
import { adminUpdateUser, findUserById, listUsers } from "@/server/repositories/users";
import { writeAudit } from "@/server/repositories/platform";
import { toPublicUser } from "@/server/services/auth-service";
import type { SessionUser } from "@/lib/auth/session";
import type { PublicUser, UserRole } from "@/types/db";

export async function listMembers(search?: string): Promise<PublicUser[]> {
  return (await listUsers(search)).map(toPublicUser);
}

/**
 * Role / activation change. The database function enforces last-administrator and self-change rules
 * atomically and bumps session_version, which revokes the target's sessions immediately.
 */
export async function updateMember(input: {
  actor: SessionUser;
  targetId: string;
  role?: UserRole;
  isActive?: boolean;
  ip: string;
}): Promise<PublicUser> {
  const before = await findUserById(input.targetId);
  if (!before) throw new AppError("NOT_FOUND", "Member not found.");
  const after = await adminUpdateUser(input.actor.id, input.targetId, input.role, input.isActive);

  const changes: Record<string, unknown> = {};
  if (before.role !== after.role) changes.role = { from: before.role, to: after.role };
  if (before.is_active !== after.is_active) changes.isActive = { from: before.is_active, to: after.is_active };
  if (Object.keys(changes).length > 0) {
    const action = changes.isActive ? (after.is_active ? "member.activated" : "member.deactivated") : "member.role_changed";
    await writeAudit({
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      action,
      targetType: "user",
      targetId: after.id,
      metadata: { email: after.email, ...changes, sessionsRevoked: true },
      ip: input.ip,
    });
  }
  return toPublicUser(after);
}
