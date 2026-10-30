"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";
import type { AttentionItem } from "@/lib/metrics/compute";
import type { OpsRecord } from "@/types/operations";
import { StatusBadge } from "@/components/ui/status-badge";
import { DetailDrawer } from "@/components/ui/detail-drawer";

interface AttentionSectionProps {
  items: AttentionItem[];
}

export function AttentionSection({ items }: AttentionSectionProps) {
  const [selectedRecord, setSelectedRecord] = useState<OpsRecord | null>(null);

  if (items.length === 0) {
    return (
      <div className="panel p-8 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 mb-2">
          <Clock className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          All Operations On Track
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          No records are currently overdue or exceeding ageing thresholds.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="panel overflow-hidden">
        <div className="panel-head flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="panel-title flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-4 h-4" />
                Operations Requiring Attention
              </h2>
              <span className="badge badge-error text-[10px]">
                {items.length} items
              </span>
            </div>
            <p className="panel-sub">
              Open records that have breached their SLA or exceeded ageing limits.
            </p>
          </div>

          <Link
            href="/operations?slaBreached=true"
            className="btn btn-ghost btn-sm text-xs gap-1 text-[var(--primary-ink)]"
          >
            <span>View all in ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-28">Record ID</th>
                <th className="min-w-[240px]">Title / Description</th>
                <th className="w-28">Status</th>
                <th className="w-28">Priority</th>
                <th className="w-36">Team</th>
                <th className="w-44">Breach Cause</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ record, reason, magnitude }) => {
                return (
                  <tr
                    key={record.id}
                    data-clickable="true"
                    onClick={() => setSelectedRecord(record)}
                    className="cursor-pointer"
                  >
                    <td className="font-mono font-medium text-xs text-[var(--ink)]">
                      {record.id}
                    </td>
                    <td className="cell-truncate font-medium text-[var(--ink)]">
                      {record.title || "—"}
                    </td>
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                    <td>
                      <StatusBadge priority={record.priority} />
                    </td>
                    <td className="text-xs text-[var(--muted-strong)]">
                      {record.team || record.assignee || "—"}
                    </td>
                    <td>
                      {reason === "overdue" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          Overdue by {Math.round(magnitude)}h
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Ageing {Math.round(magnitude)} days
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <DetailDrawer
        record={selectedRecord}
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
      />
    </>
  );
}
