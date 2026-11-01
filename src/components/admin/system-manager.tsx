"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Gauge, Save } from "lucide-react";
import type { RefreshSettings, Thresholds } from "@/types/operations";
import type { SyncRunRow, AuditLogRow } from "@/types/db";
import { useToast } from "@/components/providers/toast-provider";
import { idempotentFetch } from "@/lib/http/idempotent-fetch";

interface SystemManagerProps {
  initialRefresh: RefreshSettings;
  initialThresholds: Thresholds;
  syncRuns: SyncRunRow[];
  auditLogs: AuditLogRow[];
}

export function SystemManager({
  initialRefresh,
  initialThresholds,
  syncRuns,
  auditLogs,
}: SystemManagerProps) {
  const router = useRouter();
  const toast = useToast();

  // Refresh settings state
  const [refreshInterval, setRefreshInterval] = useState(initialRefresh.refreshIntervalSeconds);
  const [cacheTtl, setCacheTtl] = useState(initialRefresh.cacheTtlSeconds);
  const [isSavingRefresh, setIsSavingRefresh] = useState(false);

  // Thresholds state
  const [slaTarget, setSlaTarget] = useState(initialThresholds.slaTargetPercent);
  const [ageingDays, setAgeingDays] = useState(initialThresholds.ageingDays);
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);

  // Manual sync state
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSaveRefresh(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingRefresh(true);

    try {
      const res = await idempotentFetch("/api/admin/settings/refresh", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshIntervalSeconds: Number(refreshInterval),
          cacheTtlSeconds: Number(cacheTtl),
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Settings Saved", "Cache and refresh policies updated.");
        router.refresh();
      } else {
        toast.error("Save Failed", body.error?.message || "Failed to update refresh settings.");
      }
    } catch {
      toast.error("Network Error", "Unable to save refresh settings.");
    } finally {
      setIsSavingRefresh(false);
    }
  }

  async function handleSaveThresholds(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingThresholds(true);

    try {
      const res = await idempotentFetch("/api/admin/settings/thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slaTargetPercent: Number(slaTarget),
          ageingDays: Number(ageingDays),
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Thresholds Saved", "Operational benchmarks updated.");
        router.refresh();
      } else {
        toast.error("Save Failed", body.error?.message || "Failed to update thresholds.");
      }
    } catch {
      toast.error("Network Error", "Unable to save thresholds.");
    } finally {
      setIsSavingThresholds(false);
    }
  }

  async function handleTriggerSync() {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const res = await idempotentFetch("/api/data/refresh", { method: "POST" });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success(
          "Synchronization Complete",
          `Processed ${body.data?.recordCount ?? 0} records from Google Sheets.`
        );
        router.refresh();
      } else if (res.status === 409) {
        toast.info("Sync In Progress", "A synchronization lease is already held.");
      } else {
        toast.error("Sync Failed", body.error?.message || "Failed to complete synchronization.");
      }
    } catch {
      toast.error("Network Error", "Unable to contact sync service.");
    } finally {
      setIsSyncing(false);
    }
  }

  function formatDuration(started: string, finished: string | null) {
    if (!finished) return "In flight...";
    const diffMs = new Date(finished).getTime() - new Date(started).getTime();
    if (diffMs < 1000) return `${diffMs}ms`;
    return `${(diffMs / 1000).toFixed(1)}s`;
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* 1. Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cache & Background Sync */}
        <section className="panel p-6">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="w-5 h-5 text-[var(--primary)]" />
            <h2 className="panel-title">Cache &amp; Background Sync</h2>
          </div>
          <p className="panel-sub mb-4">
            Control automated Google Sheets polling intervals and memory caching TTL.
          </p>

          <form onSubmit={handleSaveRefresh} className="space-y-4">
            <div className="field">
              <label className="label" htmlFor="refresh-interval">
                Auto-Refresh Polling Interval (seconds)
              </label>
              <input
                id="refresh-interval"
                type="number"
                min={30}
                max={86400}
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(parseInt(e.target.value, 10) || 300)}
                className="input"
              />
              <span className="hint">Default: 300 seconds (5 minutes)</span>
            </div>

            <div className="field">
              <label className="label" htmlFor="cache-ttl">
                Memory Cache TTL (seconds)
              </label>
              <input
                id="cache-ttl"
                type="number"
                min={10}
                max={3600}
                value={cacheTtl}
                onChange={(e) => setCacheTtl(parseInt(e.target.value, 10) || 60)}
                className="input"
              />
              <span className="hint">Default: 60 seconds</span>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isSavingRefresh}
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              <span>{isSavingRefresh ? "Saving..." : "Save Sync Settings"}</span>
            </button>
          </form>
        </section>

        {/* Operational Thresholds */}
        <section className="panel p-6">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-5 h-5 text-amber-500" />
            <h2 className="panel-title">Operational Thresholds</h2>
          </div>
          <p className="panel-sub mb-4">
            Configure benchmark SLA targets and overdue item ageing limits.
          </p>

          <form onSubmit={handleSaveThresholds} className="space-y-4">
            <div className="field">
              <label className="label" htmlFor="sla-target">
                SLA Compliance Target (%)
              </label>
              <input
                id="sla-target"
                type="number"
                min={1}
                max={100}
                value={slaTarget}
                onChange={(e) => setSlaTarget(parseInt(e.target.value, 10) || 90)}
                className="input"
              />
              <span className="hint">Default: 90% resolution compliance</span>
            </div>

            <div className="field">
              <label className="label" htmlFor="ageing-days">
                Ageing Warning Threshold (days)
              </label>
              <input
                id="ageing-days"
                type="number"
                min={1}
                max={365}
                value={ageingDays}
                onChange={(e) => setAgeingDays(parseInt(e.target.value, 10) || 7)}
                className="input"
              />
              <span className="hint">Items older than this trigger ageing warnings</span>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isSavingThresholds}
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              <span>{isSavingThresholds ? "Saving..." : "Save Thresholds"}</span>
            </button>
          </form>
        </section>
      </div>

      {/* 2. Manual Synchronization Control */}
      <section className="panel p-6 bg-[var(--raised)] border-[var(--line)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              Manual Source Synchronization
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Acquires a database sync lease and forces an immediate pull from Google Sheets.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm gap-2"
            onClick={handleTriggerSync}
            disabled={isSyncing}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "spin" : ""}`} />
            <span>{isSyncing ? "Synchronizing..." : "Trigger Full Sync"}</span>
          </button>
        </div>
      </section>

      {/* 3. Recent Synchronization Runs */}
      <section className="panel overflow-hidden">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Data Synchronization History</h2>
            <p className="panel-sub">
              Audit log of cron, manual, and lazy Google Sheets ingest runs
            </p>
          </div>
        </div>

        <div className="table-wrap" data-lenis-prevent>
          <table className="table">
            <thead>
              <tr>
                <th className="w-28">Trigger</th>
                <th className="w-28">Status</th>
                <th className="w-36">Started</th>
                <th className="w-28">Duration</th>
                <th className="w-28">Records</th>
                <th className="min-w-[200px]">Error</th>
              </tr>
            </thead>
            <tbody>
              {syncRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-[var(--muted)]">
                    No synchronization runs recorded yet.
                  </td>
                </tr>
              ) : (
                syncRuns.slice(0, 15).map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span className="badge badge-brand text-[10px]">
                        {run.trigger}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          run.status === "succeeded"
                            ? "badge-success"
                            : run.status === "failed"
                            ? "badge-error"
                            : "badge-info"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>

                    <td className="text-xs text-[var(--muted)] font-mono">
                      {new Date(run.started_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    <td className="text-xs font-mono text-[var(--muted)]">
                      {formatDuration(run.started_at, run.finished_at)}
                    </td>

                    <td className="text-xs font-mono font-medium text-[var(--ink)]">
                      {run.rows_valid?.toLocaleString() ?? "—"}
                    </td>

                    <td className="text-xs text-red-600 dark:text-red-400 font-mono truncate max-w-xs">
                      {run.error_message || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. System Audit Trail */}
      <section className="panel overflow-hidden">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Security &amp; Administrative Audit Trail</h2>
            <p className="panel-sub">
              Immutable log of settings changes, member updates, and administrative events
            </p>
          </div>
        </div>

        <div className="table-wrap" data-lenis-prevent>
          <table className="table">
            <thead>
              <tr>
                <th className="w-48">Action</th>
                <th className="min-w-[200px]">Actor</th>
                <th className="w-40">Timestamp</th>
                <th className="w-36">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-[var(--muted)]">
                    No audit records logged yet.
                  </td>
                </tr>
              ) : (
                auditLogs.slice(0, 25).map((log) => (
                  <tr key={log.id}>
                    <td className="font-mono font-medium text-xs text-[var(--ink)]">
                      {log.action}
                    </td>

                    <td className="text-xs text-[var(--muted-strong)]">
                      {log.actor_email || "System"}
                    </td>

                    <td className="text-xs text-[var(--muted)] font-mono">
                      {new Date(log.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    <td className="text-xs text-[var(--muted)] font-mono">
                      {log.ip || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
