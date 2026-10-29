import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { getSheetsConfig } from "@/lib/env";
import { mappingFingerprint } from "@/lib/google-sheets/mapping";
import { log } from "@/lib/logger";
import { getSnapshotRecords, lastSuccessfulSyncRun, lastSyncRun, latestSnapshotMeta, type SnapshotMeta } from "@/server/repositories/platform";
import { getRefreshSettings, getSheetMapping } from "@/server/services/settings-service";
import type { OpsRecord, SheetMapping, SyncWarning } from "@/types/operations";
import type { SyncRunRow } from "@/types/db";

/**
 * Single read path for operational data.
 *
 * Source of truth  : Google Sheet.
 * Durable copy     : latest row in `data_snapshots` (written by the sync service).
 * Accelerator      : one-entry in-memory cache keyed by snapshot id. It is always validated against the
 *                    tiny `latestSnapshotMeta` query, so a stale instance can never serve outdated data.
 * Freshness policy : when the snapshot is older than the configured cache TTL, ONE background sync is
 *                    scheduled (after the response is sent). The DB lease prevents overlapping runs and a
 *                    cool-down prevents hammering Google after failures. Components never call Sheets.
 */

let memo: { id: string; records: OpsRecord[] } | undefined;

export function invalidateDatasetCache() {
  memo = undefined;
}

const FAILURE_COOLDOWN_MS = 2 * 60_000;

export type DatasetState =
  | { kind: "not_configured"; missing: "credentials" | "mapping" }
  | { kind: "no_data"; lastRun: SyncRunRow | null; mapping: SheetMapping }
  | {
      kind: "ready";
      records: OpsRecord[];
      mapping: SheetMapping;
      syncedAt: string;
      warnings: SyncWarning[];
      stale: boolean;
      mappingChanged: boolean;
      lastRun: SyncRunRow | null;
      ageSeconds: number;
    };

async function scheduleLazySync() {
  after(async () => {
    try {
      const { runSync } = await import("@/server/services/sync-service");
      await runSync({ trigger: "lazy" });
    } catch (err) {
      // SYNC_IN_PROGRESS and source errors are expected here; they are recorded by the sync service.
      log.debug("lazy_sync_skipped", { error: err });
    }
  });
}

export const getDataset = cache(async (): Promise<DatasetState> => {
  if (!getSheetsConfig()) return { kind: "not_configured", missing: "credentials" };
  const mapping = await getSheetMapping();
  if (!mapping) return { kind: "not_configured", missing: "mapping" };

  const [meta, lastRun, settings] = await Promise.all([latestSnapshotMeta(), lastSyncRun(), getRefreshSettings()]);
  const recentFailure = lastRun?.status === "failed" && lastRun.finished_at && Date.now() - new Date(lastRun.finished_at).getTime() < FAILURE_COOLDOWN_MS;
  const running = lastRun?.status === "running";

  if (!meta) {
    if (!running && !recentFailure) await scheduleLazySync();
    return { kind: "no_data", lastRun, mapping };
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(meta.synced_at).getTime()) / 1000));
  const mappingChanged = meta.mapping_hash !== mappingFingerprint(mapping);
  const overTtl = ageSeconds > settings.cacheTtlSeconds;
  if ((overTtl || mappingChanged) && !running && !recentFailure) await scheduleLazySync();

  const records = await loadRecords(meta);
  return {
    kind: "ready",
    records,
    mapping,
    syncedAt: meta.synced_at,
    warnings: meta.warnings ?? [],
    // "Stale" = we are beyond TWO refresh intervals without a fresh successful snapshot.
    stale: ageSeconds > Math.max(settings.refreshIntervalSeconds * 2, settings.cacheTtlSeconds * 2),
    mappingChanged,
    lastRun,
    ageSeconds,
  };
});

async function loadRecords(meta: SnapshotMeta): Promise<OpsRecord[]> {
  if (memo?.id === meta.id) return memo.records;
  const records = await getSnapshotRecords(meta.id);
  memo = { id: meta.id, records };
  return records;
}

export interface Freshness {
  configured: boolean;
  syncedAt: string | null;
  ageSeconds: number | null;
  stale: boolean;
  lastRunStatus: SyncRunRow["status"] | null;
  lastError: string | null;
  refreshIntervalSeconds: number;
}

/** Lightweight status for the top bar (no record payload). */
export const getFreshness = cache(async (): Promise<Freshness> => {
  const settings = await getRefreshSettings();
  const configured = Boolean(getSheetsConfig()) && Boolean(await getSheetMapping());
  if (!configured) {
    return { configured: false, syncedAt: null, ageSeconds: null, stale: false, lastRunStatus: null, lastError: null, refreshIntervalSeconds: settings.refreshIntervalSeconds };
  }
  const [success, last] = await Promise.all([lastSuccessfulSyncRun(), lastSyncRun()]);
  const syncedAt = success?.finished_at ?? null;
  const ageSeconds = syncedAt ? Math.max(0, Math.round((Date.now() - new Date(syncedAt).getTime()) / 1000)) : null;
  return {
    configured: true,
    syncedAt,
    ageSeconds,
    stale: ageSeconds === null ? true : ageSeconds > Math.max(settings.refreshIntervalSeconds * 2, settings.cacheTtlSeconds * 2),
    lastRunStatus: last?.status ?? null,
    lastError: last?.status === "failed" ? last.error_message : null,
    refreshIntervalSeconds: settings.refreshIntervalSeconds,
  };
});
