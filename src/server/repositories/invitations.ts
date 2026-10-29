import "server-only";
import { db, unwrap, unwrapMaybe } from "@/lib/supabase/admin";
import { appErrorFromDbMessage, AppError } from "@/lib/errors";
import type { InvitationRow, UserRole, UserRow } from "@/types/db";

export interface InvitationWithInviter extends InvitationRow {
  inviter: { name: string; email: string } | null;
}

export async function listInvitations(): Promise<InvitationWithInviter[]> {
  const rows = unwrap(
    await db()
      .from("invitations")
      .select("*, inviter:users!invitations_invited_by_fkey(name,email)")
      .order("created_at", { ascending: false })
      .limit(300),
    "invitations.list",
  ) as unknown as InvitationWithInviter[];
  return rows;
}

export async function getInvitation(id: string): Promise<InvitationRow | null> {
  return unwrapMaybe(await db().from("invitations").select("*").eq("id", id).maybeSingle<InvitationRow>(), "invitations.get");
}

export async function getInvitationByTokenHash(hash: string): Promise<InvitationRow | null> {
  return unwrapMaybe(await db().from("invitations").select("*").eq("token_hash", hash).maybeSingle<InvitationRow>(), "invitations.byHash");
}

export async function getPendingInvitationByEmail(email: string): Promise<InvitationRow | null> {
  return unwrapMaybe(
    await db().from("invitations").select("*").eq("email", email).eq("status", "pending").maybeSingle<InvitationRow>(),
    "invitations.pendingByEmail",
  );
}

export async function createInvitation(input: {
  email: string;
  role: UserRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}): Promise<InvitationRow> {
  const res = await db()
    .from("invitations")
    .insert({
      email: input.email,
      role: input.role,
      token_hash: input.tokenHash,
      invited_by: input.invitedBy,
      expires_at: input.expiresAt.toISOString(),
    })
    .select("*")
    .single<InvitationRow>();
  if (res.error) {
    if (res.error.code === "23505") throw new AppError("CONFLICT", "A pending invitation for this email already exists.");
    throw new AppError("INTERNAL", "A database error occurred.");
  }
  return res.data;
}

/** Replaces the token (invalidating the previously emailed link) and extends the expiry. */
export async function rotateInvitationToken(id: string, tokenHash: string, expiresAt: Date): Promise<InvitationRow | null> {
  const rows = unwrap(
    await db()
      .from("invitations")
      .update({ token_hash: tokenHash, expires_at: expiresAt.toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("*"),
    "invitations.rotate",
  ) as InvitationRow[];
  return rows[0] ?? null;
}

export async function markInvitationSent(id: string): Promise<void> {
  unwrap(await db().from("invitations").update({ last_sent_at: new Date().toISOString() }).eq("id", id).select("id"), "invitations.markSent");
}

export async function revokeInvitation(id: string): Promise<InvitationRow | null> {
  const rows = unwrap(
    await db()
      .from("invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("*"),
    "invitations.revoke",
  ) as InvitationRow[];
  return rows[0] ?? null;
}

export async function acceptInvitation(tokenHash: string, name: string, passwordHash: string): Promise<UserRow> {
  const res = await db().rpc("accept_invitation", { p_token_hash: tokenHash, p_name: name, p_password_hash: passwordHash });
  if (res.error) throw appErrorFromDbMessage(res.error.message);
  return res.data as UserRow;
}
