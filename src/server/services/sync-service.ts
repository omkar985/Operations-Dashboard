import "server-only";
import { AppError, isAppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { getSheetsConfig } from "@/lib/env";
import { mapRows, mappingFingerprint, normalizeHeader, getRecordCol } from "@/lib/google-sheets/mapping";
import { getSpreadsheetInfo, readWorksheet, fetchWorksheetByTitle, SheetsError } from "@/server/integrations/google-sheets";
import { isHvcRecord } from "@/lib/metrics/compute";
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
import type { OpsRecord, SyncWarning } from "@/types/operations";
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
 * Synchronises the configured worksheet(s) into a new snapshot.
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
    const cfg = getSheetsConfig();

    // Support single worksheet or multiple subsheets (comma-separated in mapping or configured in env)
    const mappingSheets = mapping.worksheet.includes(",")
      ? mapping.worksheet.split(",").map((s) => s.trim()).filter(Boolean)
      : [mapping.worksheet.trim()].filter(Boolean);
    const envSheets = cfg?.worksheets ?? [];
    const sheetTitles = Array.from(new Set([...mappingSheets, ...envSheets]));

    const targetWorksheets = sheetTitles
      .map(
        (name) =>
          info.worksheets.find((w) => w.title === name) ??
          info.worksheets.find((w) => w.title.trim().toLowerCase() === name.trim().toLowerCase())
      )
      .filter((w): w is NonNullable<typeof w> => Boolean(w));

    if (targetWorksheets.length === 0) {
      throw new AppError(
        "MAPPING_INVALID",
        `Worksheet(s) [${sheetTitles.join(", ")}] do not exist in “${info.title}”. Available: ${info.worksheets.map((w) => w.title).join(", ") || "none"}.`
      );
    }

    let allRecords: OpsRecord[] = [];
    let allRowsRead = 0;
    let allRowsBlank = 0;
    const warnings: SyncWarning[] = [];

    for (let wsIdx = 0; wsIdx < targetWorksheets.length; wsIdx++) {
      const ws = targetWorksheets[wsIdx];
      const read = await readWorksheet(ws, mapping.headerRow);
      const mapped = mapRows(read.rows, read.headers, mapping, mapping.headerRow + 1, ws.title);
      allRowsRead += mapped.rowsRead;
      allRowsBlank += mapped.rowsBlank;
      allRecords = allRecords.concat(mapped.records);

      // Multi-sheet operations pipelines naturally have differing column headers across tabs
      // and intentionally repeated headers (e.g. intake "Status" vs fulfillment "Status" in Kanto).
      // Filter out benign MISSING_COLUMN and DUPLICATE_HEADER notices so they do not surface as false alarms.
      const relevantWarnings = mapped.warnings.filter(
        (w) => w.code !== "MISSING_COLUMN" && w.code !== "DUPLICATE_HEADER"
      );
      warnings.push(...relevantWarnings);

      if (read.truncated) {
        warnings.push({
          code: "ROW_LIMIT",
          message: `Worksheet “${ws.title}” exceeds the 100,000 row import limit; later rows were not imported.`,
        });
      }
    }

    const mappedColumns = Object.keys(mapping.columns).length;
    const missingCount = warnings.filter((w) => w.code === "MISSING_COLUMN").length;
    if (mappedColumns > 0 && missingCount >= mappedColumns * targetWorksheets.length) {
      throw new AppError("MAPPING_INVALID", "None of the mapped column headers were found in the worksheet(s). Re-check the mapping against the sheet's header row.");
    }
    if (allRecords.length === 0 && allRowsRead > 0) {
      warnings.push({ code: "NO_MAPPED_VALUES", message: "Rows were read but none contained values in the mapped columns." });
    }

    // High Value Cancellations: enrich records by looking up "What would you like?" from secondary sheet
    if (allRecords.some(isHvcRecord)) {
      try {
        const secSpreadsheetId =
          cfg?.cancellationsSpreadsheetId ||
          process.env.GOOGLE_SHEETS_CANCELLATIONS_SPREADSHEET_ID?.trim() ||
          "1R2aB21rRqoqRwLjDEyiiquiVcP5D76MCtAsSb087Us4";
        const secWorksheetName =
          cfg?.cancellationsWorksheet ||
          process.env.GOOGLE_SHEETS_CANCELLATIONS_WORKSHEET?.trim() ||
          "Request Cancellation Data ";

        const secRead = await fetchWorksheetByTitle(secSpreadsheetId, secWorksheetName, mapping.headerRow);
        if (secRead && secRead.headers.length > 0) {
          const orderColIdx = secRead.headers.findIndex((h) => {
            const norm = normalizeHeader(h);
            return norm === "order name" || norm === "order number" || norm === "order id";
          });
          const choiceColIdx = secRead.headers.findIndex((h) => {
            const norm = normalizeHeader(h);
            return norm === "what would you like?" || norm === "customer choice";
          });

          if (orderColIdx >= 0 && choiceColIdx >= 0) {
            const choiceMap = new Map<string, string>();
            for (const row of secRead.rows) {
              const ord = String(row[orderColIdx] ?? "").trim();
              const choice = String(row[choiceColIdx] ?? "").trim();
              if (ord && choice) {
                choiceMap.set(ord.toLowerCase(), choice);
                const numOnly = ord.replace(/[^0-9]/g, "");
                if (numOnly) choiceMap.set(numOnly, choice);
              }
            }

            for (const r of allRecords) {
              if (!isHvcRecord(r)) continue;
              const ord =
                getRecordCol(r, "Order Name") ??
                getRecordCol(r, "Order Number") ??
                r.id ??
                "";
              const numOnly = String(ord).replace(/[^0-9]/g, "");
              const lookedUp =
                choiceMap.get(String(ord).trim().toLowerCase()) ??
                (numOnly ? choiceMap.get(numOnly) : undefined);

              if (!r.raw) r.raw = {};
              const finalChoice = lookedUp || r.raw["What would you like?"] || r.raw["Customer Choice"] || "";
              r.raw["Customer Choice"] = finalChoice;
              r.raw["What would you like?"] = finalChoice;
            }
            log.info("hvc_cancellation_data_enriched", { enrichedCount: choiceMap.size });
          }
        }
      } catch (secErr) {
        log.warn("hvc_cancellation_enrichment_failed", {
          error: secErr instanceof Error ? secErr.message : String(secErr),
        });
      }
    }

    const snapshotId = await insertSnapshot({
      runId: run.id,
      rowCount: allRecords.length,
      mappingHash: mappingFingerprint(mapping),
      records: allRecords,
      warnings,
    });
    await finishSyncRun(run.id, {
      status: "succeeded",
      rowsRead: allRowsRead,
      rowsValid: allRecords.length,
      rowsSkipped: allRowsBlank,
      snapshotId,
    });
    invalidateDatasetCache();
    await pruneSnapshots(3).catch((e) => log.warn("snapshot_prune_failed", { error: e }));
    log.info("sync_succeeded", { runId: run.id, trigger: opts.trigger, rows: allRecords.length, warnings: warnings.length });
    return { runId: run.id, rowsRead: allRowsRead, rowsValid: allRecords.length, rowsSkipped: allRowsBlank, warnings };
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
