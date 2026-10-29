"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown, AlertCircle } from "lucide-react";
import type { OpsRecord } from "@/types/operations";
import type { SortKey } from "@/lib/metrics/records-query";
import { StatusBadge } from "@/components/ui/status-badge";
import { DetailDrawer } from "@/components/ui/detail-drawer";
import { Pagination } from "@/components/ui/pagination";

interface OperationsTableViewProps {
  rows: OpsRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  currentSort?: SortKey;
  currentDir?: "asc" | "desc";
  nowIso: string;
}

export function OperationsTableView({
  rows,
  total,
  page,
  pageSize,
  pageCount,
  currentSort = "row",
  currentDir = "asc",
  nowIso,
}: OperationsTableViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedRecord, setSelectedRecord] = useState<OpsRecord | null>(null);

  const nowMs = new Date(nowIso).getTime();

  function handleSort(key: SortKey) {
    const next = new URLSearchParams(searchParams?.toString() || "");
    if (currentSort === key) {
      next.set("dir", currentDir === "asc" ? "desc" : "asc");
    } else {
      next.set("sort", key);
      next.set("dir", "asc");
    }
    next.set("page", "1");
    router.push(`${pathname}?${next.toString()}`);
  }

  function renderSortIcon(key: SortKey) {
    if (currentSort !== key) {
      return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />;
    }
    return currentDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-[var(--primary)]" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[var(--primary)]" />
    );
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function isOverdue(r: OpsRecord) {
    if (!r.dueAt || r.resolvedAt) return false;
    const dueMs = Date.parse(r.dueAt);
    return !Number.isNaN(dueMs) && dueMs < nowMs;
  }

  return (
    <>
      <div className="panel overflow-hidden">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th
                  onClick={() => handleSort("id")}
                  className="cursor-pointer group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>ID</span>
                    {renderSortIcon("id")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("title")}
                  className="cursor-pointer group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Title</span>
                    {renderSortIcon("title")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("status")}
                  className="cursor-pointer group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    {renderSortIcon("status")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("priority")}
                  className="cursor-pointer group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Priority</span>
                    {renderSortIcon("priority")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("team")}
                  className="cursor-pointer group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Team</span>
                    {renderSortIcon("team")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("assignee")}
                  className="cursor-pointer group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Assignee</span>
                    {renderSortIcon("assignee")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("createdAt")}
                  className="cursor-pointer group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Created</span>
                    {renderSortIcon("createdAt")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("dueAt")}
                  className="cursor-pointer group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Due Date</span>
                    {renderSortIcon("dueAt")}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[var(--muted)]">
                    No matching operational records found. Try adjusting your search query or filters.
                  </td>
                </tr>
              ) : (
                rows.map((record) => {
                  const overdue = isOverdue(record);
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
                        {record.team || "—"}
                      </td>
                      <td className="text-xs text-[var(--muted-strong)]">
                        {record.assignee || "—"}
                      </td>
                      <td className="text-xs text-[var(--muted)] font-mono">
                        {formatDate(record.createdAt)}
                      </td>
                      <td className="text-xs font-mono">
                        {overdue ? (
                          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {formatDate(record.dueAt)}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">
                            {formatDate(record.dueAt)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          pageCount={pageCount}
        />
      </div>

      <DetailDrawer
        record={selectedRecord}
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
      />
    </>
  );
}
