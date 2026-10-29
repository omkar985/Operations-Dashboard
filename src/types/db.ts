/** Row types for the Supabase tables (see supabase/migrations). */

export type UserRole = "ADMIN" | "USER";
export type InvitationStatus = "pending" | "accepted" | "revoked";
export type NotificationStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";
export type NotificationType = "invitation" | "password_reset" | "admin_notice";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  session_version: number;
  last_login_at: string | null;
  password_changed_at: string;
  created_at: string;
  updated_at: string;
}

/** User fields that may be sent to the browser (never the hash). */
export type PublicUser = Omit<UserRow, "password_hash" | "session_version" | "updated_at">;

export interface InvitationRow {
  id: string;
  email: string;
  role: UserRole;
  token_hash: string;
  status: InvitationStatus;
  invited_by: string | null;
  expires_at: string;
  last_sent_at: string | null;
  accepted_at: string | null;
  accepted_user_id: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  type: NotificationType;
  recipient: string;
  subject: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  provider_message_id: string | null;
  related_invitation_id: string | null;
  related_user_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface AuditLogRow {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

export interface SyncRunRow {
  id: string;
  trigger: "cron" | "manual" | "lazy";
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  rows_read: number | null;
  rows_valid: number | null;
  rows_skipped: number | null;
  error_code: string | null;
  error_message: string | null;
  triggered_by: string | null;
  snapshot_id: string | null;
}
