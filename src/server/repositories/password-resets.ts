import "server-only";
import { db, unwrap } from "@/lib/supabase/admin";
import { appErrorFromDbMessage } from "@/lib/errors";

export async function createPasswordReset(input: { userId: string; tokenHash: string; expiresAt: Date; ip: string | null }): Promise<string> {
  const row = unwrap(
    await db()
      .from("password_resets")
      .insert({ user_id: input.userId, token_hash: input.tokenHash, expires_at: input.expiresAt.toISOString(), requested_ip: input.ip })
      .select("id")
      .single<{ id: string }>(),
    "resets.create",
  );
  return row.id;
}

/** Marks earlier unused tokens as used so only the newest emailed link ever works. */
export async function invalidateOutstandingResets(userId: string): Promise<void> {
  unwrap(await db().from("password_resets").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null).select("id"), "resets.invalidate");
}

export async function consumePasswordReset(tokenHash: string, passwordHash: string): Promise<string> {
  const res = await db().rpc("consume_password_reset", { p_token_hash: tokenHash, p_password_hash: passwordHash });
  if (res.error) throw appErrorFromDbMessage(res.error.message);
  return res.data as string;
}

export async function getResetByTokenHash(tokenHash: string) {
  const res = await db().from("password_resets").select("id,expires_at,used_at").eq("token_hash", tokenHash).maybeSingle<{ id: string; expires_at: string; used_at: string | null }>();
  if (res.error) throw appErrorFromDbMessage(res.error.message);
  return res.data;
}
