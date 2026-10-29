import "server-only";
import { appOrigin, getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { buildAppUrl, isAppOriginUrl } from "@/lib/email/links";
import { renderAdminNoticeEmail, renderInvitationEmail, renderPasswordResetEmail, type RenderedEmail } from "@/lib/email/templates";
import { EmailDeliveryError, sendMail } from "@/server/integrations/smtp";
import {
  cancelNotification,
  claimNotification,
  enqueueNotification,
  getNotification,
  listDueNotifications,
  markNotificationFailed,
  markNotificationSent,
  requeueFailedNotification,
} from "@/server/repositories/outbox";
import { getInvitation, markInvitationSent } from "@/server/repositories/invitations";
import type { InvitationRow, NotificationRow, UserRow } from "@/types/db";

/**
 * Notification outbox.
 *
 * Email is an external operation that can fail independently of the database. Every message is first
 * persisted (`pending`), then delivered by `deliver()`:
 *   1. atomic claim (pending|failed → sending) so concurrent callers can never double-send;
 *   2. render + SMTP send;
 *   3. only after the provider ACCEPTS the recipient is the row marked `sent` (and its link redacted);
 *   4. failures are recorded with a safe message and a backoff, and can be retried from the admin UI.
 */

const BACKOFF_MINUTES = [1, 5, 15, 60, 360];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

interface LinkPayload {
  url?: string;
  inviterName?: string | null;
  role?: "ADMIN" | "USER";
  expiresAt?: string;
  message?: string;
  cta?: string;
}

export async function queueInvitationEmail(inv: InvitationRow, rawToken: string, inviterName: string | null): Promise<NotificationRow> {
  const url = buildAppUrl(appOrigin(), "/accept-invitation", { token: rawToken });
  const subject = renderInvitationEmail({ url: "https://placeholder.invalid", inviterName, role: inv.role, expiresAt: inv.expires_at }).subject;
  return enqueueNotification({
    type: "invitation",
    recipient: inv.email,
    subject,
    payload: { url, inviterName, role: inv.role, expiresAt: inv.expires_at } satisfies LinkPayload,
    relatedInvitationId: inv.id,
  });
}

export async function queuePasswordResetEmail(user: UserRow, rawToken: string, expiresAt: Date): Promise<NotificationRow> {
  const url = buildAppUrl(appOrigin(), "/reset-password", { token: rawToken });
  const subject = renderPasswordResetEmail({ url: "https://placeholder.invalid", expiresAt: expiresAt.toISOString() }).subject;
  return enqueueNotification({
    type: "password_reset",
    recipient: user.email,
    subject,
    payload: { url, expiresAt: expiresAt.toISOString() } satisfies LinkPayload,
    relatedUserId: user.id,
  });
}

function render(n: NotificationRow): RenderedEmail {
  const p = n.payload as LinkPayload;
  if (!p.url) throw new EmailDeliveryError("TRANSPORT", "Message content is no longer available (already delivered or cancelled).");
  // Defence in depth: a stored link must still point at our own origin.
  if (!isAppOriginUrl(appOrigin(), p.url)) throw new EmailDeliveryError("TRANSPORT", "Link origin mismatch; message blocked.");
  switch (n.type) {
    case "invitation":
      return renderInvitationEmail({ url: p.url, inviterName: p.inviterName ?? null, role: p.role ?? "USER", expiresAt: p.expiresAt ?? new Date().toISOString() });
    case "password_reset":
      return renderPasswordResetEmail({ url: p.url, expiresAt: p.expiresAt ?? new Date().toISOString() });
    case "admin_notice":
      return renderAdminNoticeEmail({ subject: n.subject, message: p.message ?? "", url: p.url, cta: p.cta ?? "Open dashboard" });
  }
}

const redact = (p: Record<string, unknown>): Record<string, unknown> => {
  const { url: _url, ...rest } = p;
  void _url;
  return { ...rest, linkRemoved: true };
};

export type DeliveryOutcome = "sent" | "failed" | "skipped" | "cancelled";

export async function deliver(id: string): Promise<DeliveryOutcome> {
  const existing = await getNotification(id);
  if (!existing) return "skipped";

  // Don't mail links for invitations that are no longer usable.
  if (existing.type === "invitation" && existing.related_invitation_id && existing.status !== "sent") {
    const inv = await getInvitation(existing.related_invitation_id);
    if (!inv || inv.status !== "pending" || new Date(inv.expires_at) <= new Date()) {
      await cancelNotification(id, "Invitation is no longer pending");
      return "cancelled";
    }
  }

  const claimed = await claimNotification(id);
  if (!claimed) return "skipped"; // already sent / in flight elsewhere — never duplicate

  try {
    const mail = render(claimed);
    const { messageId } = await sendMail({ to: claimed.recipient, ...mail });
    // The provider accepted the message: record it. Retry the write a few times — losing it would
    // allow a stale-claim re-send later.
    let recorded = false;
    for (let i = 0; i < 3 && !recorded; i++) {
      try {
        await markNotificationSent(id, messageId, redact(claimed.payload));
        recorded = true;
      } catch (e) {
        log.error("outbox_mark_sent_failed", { id, attempt: i + 1, error: e });
        await new Promise((r) => setTimeout(r, 200 * (i + 1)));
      }
    }
    if (claimed.type === "invitation" && claimed.related_invitation_id) {
      await markInvitationSent(claimed.related_invitation_id).catch(() => undefined);
    }
    log.info("email_sent", { id, type: claimed.type });
    return "sent";
  } catch (err) {
    const message =
      err instanceof EmailDeliveryError ? err.message : err instanceof Error ? err.message.slice(0, 300) : "Unknown delivery error";
    const attempt = Math.min(claimed.attempts, BACKOFF_MINUTES.length);
    const wait = BACKOFF_MINUTES[attempt - 1] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1];
    await markNotificationFailed(id, message, new Date(Date.now() + wait * 60_000));
    log.warn("email_failed", { id, type: claimed.type, attempts: claimed.attempts, message });
    return "failed";
  }
}

/** Admin-triggered retry for a failed message. */
export async function retryNotification(id: string): Promise<DeliveryOutcome> {
  const n = await getNotification(id);
  if (!n) throw new AppError("NOT_FOUND", "Notification not found.");
  if (n.status === "sent") throw new AppError("CONFLICT", "This message was already delivered.");
  if (n.status !== "failed") throw new AppError("CONFLICT", "Only failed messages can be retried.");
  await requeueFailedNotification(id);
  return deliver(id);
}

/** Cron entry point: attempts every due message with bounded concurrency. */
export async function processDueNotifications(): Promise<{ processed: number; sent: number; failed: number }> {
  const due = await listDueNotifications(25);
  let sent = 0;
  let failed = 0;
  for (const n of due) {
    if (n.attempts >= MAX_ATTEMPTS) continue;
    const outcome = await deliver(n.id);
    if (outcome === "sent") sent++;
    if (outcome === "failed") failed++;
  }
  return { processed: due.length, sent, failed };
}

export const emailConfigured = () => {
  const e = getEnv();
  return Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD && e.EMAIL_FROM);
};
