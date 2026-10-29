import "server-only";
import { db, unwrap, unwrapMaybe } from "@/lib/supabase/admin";
import { appErrorFromDbMessage } from "@/lib/errors";
import type { NotificationRow, NotificationType } from "@/types/db";

export async function enqueueNotification(input: {
  type: NotificationType;
  recipient: string;
  subject: string;
  payload: Record<string, unknown>;
  relatedInvitationId?: string | null;
  relatedUserId?: string | null;
}): Promise<NotificationRow> {
  return unwrap(
    await db()
      .from("notification_outbox")
      .insert({
        type: input.type,
        recipient: input.recipient,
        subject: input.subject,
        payload: input.payload,
        related_invitation_id: input.relatedInvitationId ?? null,
        related_user_id: input.relatedUserId ?? null,
      })
      .select("*")
      .single<NotificationRow>(),
    "outbox.enqueue",
  );
}

export async function getNotification(id: string): Promise<NotificationRow | null> {
  return unwrapMaybe(await db().from("notification_outbox").select("*").eq("id", id).maybeSingle<NotificationRow>(), "outbox.get");
}

export async function listNotifications(limit = 200): Promise<NotificationRow[]> {
  return unwrap(
    await db().from("notification_outbox").select("*").order("created_at", { ascending: false }).limit(limit).returns<NotificationRow[]>(),
    "outbox.list",
  );
}

export async function listDueNotifications(limit = 25): Promise<NotificationRow[]> {
  const now = new Date().toISOString();
  return unwrap(
    await db()
      .from("notification_outbox")
      .select("*")
      .in("status", ["pending", "failed"])
      .lte("next_attempt_at", now)
      .lt("attempts", 5)
      .order("next_attempt_at", { ascending: true })
      .limit(limit)
      .returns<NotificationRow[]>(),
    "outbox.due",
  );
}

/** Atomic claim. Returns null when the message is not eligible (already sent / in flight). */
export async function claimNotification(id: string): Promise<NotificationRow | null> {
  const res = await db().rpc("claim_outbox_notification", { p_id: id });
  if (res.error) throw appErrorFromDbMessage(res.error.message);
  const rows = (res.data ?? []) as NotificationRow[];
  return rows[0] ?? null;
}

export async function markNotificationSent(id: string, messageId: string | null, redactedPayload: Record<string, unknown>): Promise<void> {
  unwrap(
    await db()
      .from("notification_outbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: messageId,
        last_error: null,
        payload: redactedPayload,
      })
      .eq("id", id)
      .select("id"),
    "outbox.markSent",
  );
}

export async function markNotificationFailed(id: string, error: string, retryAt: Date): Promise<void> {
  unwrap(
    await db()
      .from("notification_outbox")
      .update({ status: "failed", last_error: error.slice(0, 500), next_attempt_at: retryAt.toISOString() })
      .eq("id", id)
      .select("id"),
    "outbox.markFailed",
  );
}

export async function cancelNotification(id: string, reason: string): Promise<void> {
  unwrap(
    await db().from("notification_outbox").update({ status: "cancelled", last_error: reason, payload: {} }).eq("id", id).in("status", ["pending", "failed"]).select("id"),
    "outbox.cancel",
  );
}

/** Cancels unsent messages for an invitation whose link was rotated or revoked (their tokens are dead). */
export async function cancelUnsentForInvitation(invitationId: string, reason: string): Promise<void> {
  unwrap(
    await db()
      .from("notification_outbox")
      .update({ status: "cancelled", last_error: reason, payload: {} })
      .eq("related_invitation_id", invitationId)
      .in("status", ["pending", "failed"])
      .select("id"),
    "outbox.cancelForInvitation",
  );
}

/** Admin "retry" — makes a failed message immediately eligible and resets the attempt budget. */
export async function requeueFailedNotification(id: string): Promise<NotificationRow | null> {
  const rows = unwrap(
    await db()
      .from("notification_outbox")
      .update({ next_attempt_at: new Date().toISOString(), attempts: 0 })
      .eq("id", id)
      .eq("status", "failed")
      .select("*"),
    "outbox.requeue",
  ) as NotificationRow[];
  return rows[0] ?? null;
}
