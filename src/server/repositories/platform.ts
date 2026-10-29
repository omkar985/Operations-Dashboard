import "server-only";
import { db, unwrap, unwrapMaybe } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import { appErrorFromDbMessage } from "@/lib/errors";
import type { AuditLogRow, SyncRunRow } from "@/types/db";
import type { OpsRecord, SettingKey, SyncWarning } from "@/types/operations";

// ------------------------------------------------------------------ audit
export interface AuditInput {
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Audit failures are logged but never block the primary operation after it has succeeded. */
export async function writeAudit(input: AuditInput): Promise<void> {
  const res = await db().from("audit_logs").insert({
    actor_id: input.actorId,
    actor_email: input.actorEmail,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
    ip: input.ip ?? null,
  });
  if (res.error) log.error("audit_write_failed", { action: input.action, message: res.error.message });
}

export async function listAudit(limit = 200): Promise<AuditLogRow[]> {
  return unwrap(await db().from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit).returns<AuditLogRow[]>(), "audit.list");
}

// ------------------------------------------------------------------ settings
export async function getSetting<T>(key: SettingKey): Promise<T | null> {
  const row = unwrapMaybe(await db().from("app_settings").select("value").eq("key", key).maybeSingle<{ value: T }>(), `settings.get.${key}`);
  return row?.value ?? null;
}

export async function putSetting(key: SettingKey, value: unknown, userId: string | null): Promise<void> {
  unwrap(
    await db().from("app_settings").upsert({ key, value, updated_by: userId, updated_at: new Date().toISOString() }).select("key"),
    `settings.put.${key}`,
  );
}

// ------------------------------------------------------------------ sync runs
export async function beginSyncRun(trigger: "cron" | "manual" | "lazy", userId: string | null): Promise<SyncRunRow> {
  const res = await db().rpc("begin_sync_run", { p_trigger: trigger, p_user: userId });
  if (res.error) throw appErrorFromDbMessage(res.error.message);
  return res.data as SyncRunRow;
}

export async function finishSyncRun(
  id: string,
  patch: {
    status: "succeeded" | "failed";
    rowsRead?: number;
    rowsValid?: number;
    rowsSkipped?: number;
    errorCode?: string;
    errorMessage?: string;
    snapshotId?: string;
  },
): Promise<void> {
  unwrap(
    await db()
      .from("data_sync_runs")
      .update({
        status: patch.status,
        finished_at: new Date().toISOString(),
        rows_read: patch.rowsRead ?? null,
        rows_valid: patch.rowsValid ?? null,
        rows_skipped: patch.rowsSkipped ?? null,
        error_code: patch.errorCode ?? null,
        error_message: patch.errorMessage?.slice(0, 500) ?? null,
        snapshot_id: patch.snapshotId ?? null,
      })
      .eq("id", id)
      .select("id"),
    "sync.finish",
  );
}

export async function listSyncRuns(limit = 25): Promise<SyncRunRow[]> {
  return unwrap(await db().from("data_sync_runs").select("*").order("started_at", { ascending: false }).limit(limit).returns<SyncRunRow[]>(), "sync.list");
}

export async function lastSyncRun(): Promise<SyncRunRow | null> {
  const rows = await listSyncRuns(1);
  return rows[0] ?? null;
}

export async function lastSuccessfulSyncRun(): Promise<SyncRunRow | null> {
  return unwrapMaybe(
    await db().from("data_sync_runs").select("*").eq("status", "succeeded").order("started_at", { ascending: false }).limit(1).maybeSingle<SyncRunRow>(),
    "sync.lastSuccess",
  );
}

// ------------------------------------------------------------------ snapshots
export interface SnapshotMeta {
  id: string;
  synced_at: string;
  row_count: number;
  mapping_hash: string;
  warnings: SyncWarning[];
}

export async function insertSnapshot(input: {
  runId: string;
  rowCount: number;
  mappingHash: string;
  records: OpsRecord[];
  warnings: SyncWarning[];
}): Promise<string> {
  const row = unwrap(
    await db()
      .from("data_snapshots")
      .insert({
        run_id: input.runId,
        row_count: input.rowCount,
        mapping_hash: input.mappingHash,
        records: input.records,
        warnings: input.warnings,
      })
      .select("id")
      .single<{ id: string }>(),
    "snapshots.insert",
  );
  return row.id;
}

export async function latestSnapshotMeta(): Promise<SnapshotMeta | null> {
  return unwrapMaybe(
    await db()
      .from("data_snapshots")
      .select("id,synced_at,row_count,mapping_hash,warnings")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle<SnapshotMeta>(),
    "snapshots.latestMeta",
  );
}

export async function getSnapshotRecords(id: string): Promise<OpsRecord[]> {
  const row = unwrap(await db().from("data_snapshots").select("records").eq("id", id).single<{ records: OpsRecord[] }>(), "snapshots.records");
  return row.records;
}

/** Keeps the newest `keep` snapshots so the table does not grow without bound. */
export async function pruneSnapshots(keep = 3): Promise<void> {
  const ids = unwrap(
    await db().from("data_snapshots").select("id").order("synced_at", { ascending: false }).range(keep, keep + 200).returns<{ id: string }[]>(),
    "snapshots.pruneList",
  );
  if (ids.length === 0) return;
  unwrap(await db().from("data_snapshots").delete().in("id", ids.map((r) => r.id)).select("id"), "snapshots.prune");
}

export async function purgeRateLimits(): Promise<void> {
  const res = await db().rpc("rate_limit_purge", { p_older_than_seconds: 86400 });
  if (res.error) log.warn("rate_limit_purge_failed", { message: res.error.message });
}
