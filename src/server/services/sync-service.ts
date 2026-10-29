import "server-only";
import { AppError, isAppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { getSheetsConfig } from "@/lib/env";
import { mapRows, mappingFingerprint } from "@/lib/google-sheets/mapping";
import { getSpreadsheetInfo, readWorksheet, SheetsError } from "@/server/integrations/google-sheets";
import { getSheetMapping } from "@/server/services/settings-service";
import { enqueueNotification } from "@/server/repositories/outbox";
import { deliver } from "@/server/services/notification-service";
import { listUsers } from "@/server/repositories/users";
import {
  beginSyncRun,
  finishSyncRun,
  insertSnapshot,
  lastSyncRun,
  pruneSnapshots,
  purgeRateLimits,
  writeAudit,
} from "@/server/repositories/platform";
import { appOrigin } from "@/lib/env";
import { buildAppUrl } from "@/lib/email/links";
import { invalidateDatasetCache } from "@/server/services/dataset-service";
import type { SyncWarning } from "@/types/operations";
import type { SessionUser } from "@/lib/auth/session";

export type SyncTrigger = "cron" | "manual" | "lazy";

export interface SyncSummary {
  runId: string;
  rowsRead: number;
  rowsValid: number;
  rowsSkipped: number;
  warnings: SyncWarning[];
}

const safeMessage = (err: unknown): { code: string; message: string } => {
  if (err instanceof SheetsError) return { code: err.code, message: err.message };
  if (isAppError(err)) return { code: err.code, message: err.message };
  return { code: "UNEXPECTED", message: "Unexpected error while synchronising. See server logs." };
};

/**
 * Synchronises the configured worksheet into a new snapshot.
 *
 *  - never overlaps: `begin_sync_run` takes a database-level lease (unique partial index);
 *  - every attempt (success or failure) is recorded in data_sync_runs;
 *  - the previous snapshot stays in service until a new one is stored successfully.
 */
export async function runSync(opts: { trigger: SyncTrigger; actor?: SessionUser | null }): Promise<SyncSummary> {
  if (!getSheetsConfig()) throw new AppError("SOURCE_NOT_CONFIGURED", "Google Sheets credentials are not configured.");
  const mapping = await getSheetMapping();
  if (!mapping) throw new AppError("SOURCE_NOT_CONFIGURED", "No worksheet/column mapping has been saved yet. An administrator can set it in Admin → Data source.");

  const previous = await lastSyncRun();
  const run = await beginSyncRun(opts.trigger, opts.actor?.id ?? null); // throws SYNC_IN_PROGRESS when busy

  try {
    const info = await getSpreadsheetInfo();
    const ws = info.worksheets.find((w) => w.title === mapping.worksheet) ?? info.worksheets.find((w) => w.title.toLowerCase() === mapping.worksheet.toLowerCase());
    if (!ws) {
      throw new AppError("MAPPING_INVALID", `Worksheet “${mapping.worksheet}” does not exist in “${info.title}”. Available: ${info.worksheets.map((w) => w.title).join(", ") || "none"}.`);
    }

    const read = await readWorksheet(ws, mapping.headerRow);
    const mapped = mapRows(read.rows, read.headers, mapping, mapping.headerRow + 1);
    const warnings = [...mapped.warnings];
    if (read.truncated) warnings.push({ code: "ROW_LIMIT", message: "The worksheet exceeds the 100,000 row import limit; later rows were not imported." });

    const mappedColumns = Object.keys(mapping.columns).length;
    const missingCount = mapped.warnings.filter((w) => w.code === "MISSING_COLUMN").length;
    if (missingCount >= mappedColumns) {
      throw new AppError("MAPPING_INVALID", "None of the mapped column headers were found in the worksheet. Re-check the mapping against the sheet's header row.");
    }
    if (mapped.records.length === 0 && mapped.rowsRead > 0) {
      warnings.push({ code: "NO_MAPPED_VALUES", message: "Rows were read but none contained values in the mapped columns." });
    }

    const snapshotId = await insertSnapshot({
      runId: run.id,
      rowCount: mapped.records.length,
      mappingHash: mappingFingerprint(mapping),
      records: mapped.records,
      warnings,
    });
    await finishSyncRun(run.id, {
      status: "succeeded",
      rowsRead: mapped.rowsRead,
      rowsValid: mapped.records.length,
      rowsSkipped: mapped.rowsBlank,
      snapshotId,
    });
    invalidateDatasetCache();
    await pruneSnapshots(3).catch((e) => log.warn("snapshot_prune_failed", { error: e }));
    log.info("sync_succeeded", { runId: run.id, trigger: opts.trigger, rows: mapped.records.length, warnings: warnings.length });
    return { runId: run.id, rowsRead: mapped.rowsRead, rowsValid: mapped.records.length, rowsSkipped: mapped.rowsBlank, warnings };
  } catch (err) {
    const { code, message } = safeMessage(err);
    await finishSyncRun(run.id, { status: "failed", errorCode: code, errorMessage: message }).catch((e) => log.error("sync_finish_failed", { error: e }));
    log.warn("sync_failed", { runId: run.id, trigger: opts.trigger, code, message });
    // Notify administrators on the healthy → failing transition only (avoids an email every cron tick).
    if (!previous || previous.status !== "failed") await notifyAdminsOfFailure(message).catch((e) => log.warn("sync_notify_failed", { error: e }));
    throw err instanceof AppError || err instanceof SheetsError ? new AppError("SOURCE_UNAVAILABLE", message) : err;
  }
}

async function notifyAdminsOfFailure(message: string) {
  const admins = (await listUsers()).filter((u) => u.role === "ADMIN" && u.is_active);
  const url = buildAppUrl(appOrigin(), "/admin/system");
  for (const a of admins) {
    const n = await enqueueNotification({
      type: "admin_notice",
      recipient: a.email,
      subject: "Data synchronisation is failing",
      payload: { url, message: `The latest Google Sheets synchronisation failed: ${message}`, cta: "Open system health" },
      relatedUserId: a.id,
    });
    await deliver(n.id);
  }
}

/** Housekeeping hook called from the cron route. */
export async function housekeeping() {
  await purgeRateLimits();
}

export async function auditManualSync(actor: SessionUser, ip: string, summary: SyncSummary) {
  await writeAudit({ actorId: actor.id, actorEmail: actor.email, action: "sync.manual", metadata: { runId: summary.runId, rows: summary.rowsValid }, ip });
}
