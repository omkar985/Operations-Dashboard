import "server-only";
import { db, unwrap, unwrapMaybe } from "@/lib/supabase/admin";
import { appErrorFromDbMessage } from "@/lib/errors";
import type { UserRole, UserRow } from "@/types/db";

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return unwrapMaybe(await db().from("users").select("*").eq("email", email.toLowerCase()).maybeSingle<UserRow>(), "users.findByEmail");
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return unwrapMaybe(await db().from("users").select("*").eq("id", id).maybeSingle<UserRow>(), "users.findById");
}

export async function listUsers(search?: string): Promise<UserRow[]> {
  let q = db().from("users").select("*").order("created_at", { ascending: true }).limit(500);
  if (search?.trim()) {
    const s = search.trim().replace(/[%,()]/g, " ");
    q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%`);
  }
  return unwrap(await q.returns<UserRow[]>(), "users.list");
}

export async function touchLastLogin(id: string): Promise<void> {
  unwrap(await db().from("users").update({ last_login_at: new Date().toISOString() }).eq("id", id).select("id"), "users.touchLastLogin");
}

/** Sets a new password hash and revokes every existing session by bumping the session version. */
export async function setPasswordAndRevokeSessions(id: string, passwordHash: string, currentVersion: number): Promise<number> {
  const next = currentVersion + 1;
  const rows = unwrap(
    await db()
      .from("users")
      .update({ password_hash: passwordHash, password_changed_at: new Date().toISOString(), session_version: next })
      .eq("id", id)
      .eq("session_version", currentVersion)
      .select("session_version"),
    "users.setPassword",
  ) as { session_version: number }[];
  return rows[0]?.session_version ?? next;
}

export async function bumpSessionVersion(id: string): Promise<number> {
  const user = await findUserById(id);
  if (!user) return 0;
  const rows = unwrap(
    await db().from("users").update({ session_version: user.session_version + 1 }).eq("id", id).select("session_version"),
    "users.bumpSession",
  ) as { session_version: number }[];
  return rows[0]?.session_version ?? user.session_version + 1;
}

export async function adminUpdateUser(actor: string, target: string, role?: UserRole, isActive?: boolean): Promise<UserRow> {
  const res = await db().rpc("admin_update_user", { p_actor: actor, p_target: target, p_role: role ?? null, p_active: isActive ?? null });
  if (res.error) throw appErrorFromDbMessage(res.error.message);
  return res.data as UserRow;
}

export async function insertUser(input: { email: string; name: string; passwordHash: string; role: UserRole }): Promise<UserRow> {
  return unwrap(
    await db()
      .from("users")
      .insert({ email: input.email.toLowerCase(), name: input.name, password_hash: input.passwordHash, role: input.role })
      .select("*")
      .single<UserRow>(),
    "users.insert",
  );
}

export async function countActiveAdmins(): Promise<number> {
  const res = await db().from("users").select("id", { count: "exact", head: true }).eq("role", "ADMIN").eq("is_active", true);
  if (res.error) throw appErrorFromDbMessage(res.error.message);
  return res.count ?? 0;
}
