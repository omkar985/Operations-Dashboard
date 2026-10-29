import "server-only";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { generateToken, hashToken } from "@/lib/auth/crypto";
import { enforceRateLimit, LIMITS } from "@/lib/auth/rate-limit";
import { deliver, queueInvitationEmail, type DeliveryOutcome } from "@/server/services/notification-service";
import {
  createInvitation,
  getInvitation,
  listInvitations,
  revokeInvitation,
  rotateInvitationToken,
  type InvitationWithInviter,
} from "@/server/repositories/invitations";
import { cancelUnsentForInvitation } from "@/server/repositories/outbox";
import { findUserByEmail } from "@/server/repositories/users";
import { writeAudit } from "@/server/repositories/platform";
import { appOrigin } from "@/lib/env";
import { buildAppUrl } from "@/lib/email/links";
import type { SessionUser } from "@/lib/auth/session";
import type { InvitationRow, UserRole } from "@/types/db";

export type InvitationView = Omit<InvitationRow, "token_hash"> & {
  /** `expired` is derived from expires_at; it is not a stored state. */
  displayStatus: "pending" | "accepted" | "revoked" | "expired";
  inviter: { name: string; email: string } | null;
};

const toView = (r: InvitationWithInviter): InvitationView => {
  const { token_hash: _omit, ...rest } = r;
  void _omit;
  const expired = r.status === "pending" && new Date(r.expires_at) <= new Date();
  return { ...rest, displayStatus: expired ? "expired" : r.status };
};

export async function listInvitationViews(): Promise<InvitationView[]> {
  return (await listInvitations()).map(toView);
}

export interface InvitationIssueResult {
  invitationId: string;
  email: string;
  /** Raw activation link. Returned exactly once (here); only its hash is stored. */
  activationUrl: string;
  expiresAt: string;
  delivery: DeliveryOutcome;
  deliveryError?: string;
}

async function issue(inv: InvitationRow, raw: string, actor: SessionUser): Promise<InvitationIssueResult> {
  const note = await queueInvitationEmail(inv, raw, actor.name);
  const delivery = await deliver(note.id);
  return {
    invitationId: inv.id,
    email: inv.email,
    activationUrl: buildAppUrl(appOrigin(), "/accept-invitation", { token: raw }),
    expiresAt: inv.expires_at,
    delivery,
  };
}

export async function createInvitationFor(input: { actor: SessionUser; email: string; role: UserRole; ip: string }): Promise<InvitationIssueResult> {
  await enforceRateLimit(LIMITS.inviteAdmin, input.actor.id);
  if (await findUserByEmail(input.email)) throw new AppError("EMAIL_TAKEN", "An account with this email already exists.");

  const raw = generateToken();
  const expiresAt = new Date(Date.now() + getEnv().INVITATION_TTL_HOURS * 3_600_000);
  const inv = await createInvitation({ email: input.email, role: input.role, tokenHash: hashToken(raw), invitedBy: input.actor.id, expiresAt });
  await writeAudit({
    actorId: input.actor.id, actorEmail: input.actor.email, action: "invitation.created",
    targetType: "invitation", targetId: inv.id, metadata: { email: inv.email, role: inv.role }, ip: input.ip,
  });
  return issue(inv, raw, input.actor);
}

export async function resendInvitation(input: { actor: SessionUser; id: string; ip: string }): Promise<InvitationIssueResult> {
  await enforceRateLimit(LIMITS.inviteAdmin, input.actor.id);
  const existing = await getInvitation(input.id);
  if (!existing) throw new AppError("NOT_FOUND", "Invitation not found.");
  if (existing.status !== "pending") throw new AppError("CONFLICT", `This invitation is ${existing.status}.`);

  const raw = generateToken();
  const expiresAt = new Date(Date.now() + getEnv().INVITATION_TTL_HOURS * 3_600_000);
  // Rotating the token invalidates the link from any earlier email.
  const inv = await rotateInvitationToken(existing.id, hashToken(raw), expiresAt);
  if (!inv) throw new AppError("CONFLICT", "This invitation can no longer be resent.");
  await cancelUnsentForInvitation(inv.id, "Superseded by a newer invitation link");
  await writeAudit({
    actorId: input.actor.id, actorEmail: input.actor.email, action: "invitation.resent",
    targetType: "invitation", targetId: inv.id, metadata: { email: inv.email }, ip: input.ip,
  });
  return issue(inv, raw, input.actor);
}

export async function revokeInvitationById(input: { actor: SessionUser; id: string; ip: string }): Promise<void> {
  const inv = await revokeInvitation(input.id);
  if (!inv) throw new AppError("CONFLICT", "Only pending invitations can be revoked.");
  await cancelUnsentForInvitation(inv.id, "Invitation revoked");
  await writeAudit({
    actorId: input.actor.id, actorEmail: input.actor.email, action: "invitation.revoked",
    targetType: "invitation", targetId: inv.id, metadata: { email: inv.email }, ip: input.ip,
  });
}
