import Link from "next/link";
import { Download, Settings2, RefreshCw } from "lucide-react";
import { getDataset } from "@/server/services/dataset-service";
import { getThresholds } from "@/server/services/settings-service";
import { parseRange } from "@/lib/metrics/range";
import {
  queryRecords,
  distinctValues,
  type RecordQuery,
  type SortKey,
} from "@/lib/metrics/records-query";
import type { FieldKey } from "@/types/operations";
import type { MetricsConfig } from "@/lib/metrics/compute";
import { EmptyState } from "@/components/ui/empty-state";
import { OperationsFilterControls } from "@/components/operations/operations-filter-controls";
import { OperationsTableView } from "@/components/operations/operations-table-view";
import { DateRangeFilter } from "@/components/ui/date-range-filter";

interface OperationsPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
    category?: string;
    team?: string;
    assignee?: string;
    slaBreached?: string;
    sort?: string;
    dir?: string;
    page?: string;
    pageSize?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function OperationsPage(props: OperationsPageProps) {
  const params = await props.searchParams;
  const now = new Date();
  const parsedRange = parseRange(params, now, "365d");

  const [dataset, thresholds] = await Promise.all([
    getDataset(),
    getThresholds(),
  ]);

  if (dataset.kind === "not_configured") {
    return (
      <div className="page space-y-6">
        <h1 className="page-title">Operations Ledger</h1>
        <EmptyState
          icon={<Settings2 className="w-6 h-6 stroke-[1.5]" />}
          title="Source Not Configured"
          description="Connect and map your operational Google Sheet to begin exploring records."
          action={
            <Link href="/admin/source" className="btn btn-primary btn-sm">
              Configure Source
            </Link>
          }
        />
      </div>
    );
  }

  if (dataset.kind === "no_data") {
    return (
      <div className="page space-y-6">
        <h1 className="page-title">Operations Ledger</h1>
        <EmptyState
          icon={<RefreshCw className="w-6 h-6 stroke-[1.5]" />}
          title="No Operational Records"
          description="The source is configured, but no snapshot records have been saved yet."
          action={
            <Link href="/admin/system" className="btn btn-primary btn-sm">
              Trigger Sync Now
            </Link>
          }
        />
      </div>
    );
  }

  const mappedKeys = new Set(
    Object.keys(dataset.mapping.columns).filter(
      (k) => dataset.mapping.columns[k as FieldKey]
    ) as FieldKey[]
  );

  const metricsConfig: MetricsConfig = {
    mapped: mappedKeys,
    completedStatuses: dataset.mapping.completedStatuses || ["Resolved", "Closed", "Done", "Completed"],
    slaTargetPercent: thresholds.slaTargetPercent,
    ageingDays: thresholds.ageingDays,
    now,
  };

  const query: RecordQuery = {
    q: params.q,
    status: params.status,
    priority: params.priority,
    category: params.category,
    team: params.team,
    assignee: params.assignee,
    state: params.slaBreached === "true" ? "overdue" : "all",
    sort: params.sort as SortKey | undefined,
    dir: params.dir === "desc" ? "desc" : "asc",
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: params.pageSize ? parseInt(params.pageSize, 10) : 25,
    range: params.range ? parsedRange : null,
  };

  const pageData = queryRecords(dataset.records, query, metricsConfig);

  const filterOptions = {
    statuses: distinctValues(dataset.records, "status"),
    priorities: distinctValues(dataset.records, "priority"),
    teams: distinctValues(dataset.records, "team"),
    categories: distinctValues(dataset.records, "category"),
  };

  const activeFilters = {
    status: params.status,
    priority: params.priority,
    team: params.team,
    category: params.category,
    slaBreached: params.slaBreached === "true",
  };

  // Build CSV export URL passing current filters
  const exportParams = new URLSearchParams();
  if (params.q) exportParams.set("q", params.q);
  if (params.status) exportParams.set("status", params.status);
  if (params.priority) exportParams.set("priority", params.priority);
  if (params.team) exportParams.set("team", params.team);
  if (params.category) exportParams.set("category", params.category);
  if (params.slaBreached) exportParams.set("slaBreached", params.slaBreached);
  if (params.range) exportParams.set("range", params.range);
  if (params.from) exportParams.set("from", params.from);
  if (params.to) exportParams.set("to", params.to);

  const exportUrl = `/api/operations/export?${exportParams.toString()}`;

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Operations Ledger</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Browse, filter, and inspect operational records directly from Google Sheets
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <DateRangeFilter currentRange={parsedRange} />

          <a
            href={exportUrl}
            className="btn btn-sm btn-ghost gap-1.5 text-xs text-[var(--muted-strong)] hover:text-[var(--ink)]"
            title="Export filtered records to CSV"
            download
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </a>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <OperationsFilterControls
        options={filterOptions}
        active={activeFilters}
      />

      {/* Records Table */}
      <OperationsTableView
        rows={pageData.rows}
        total={pageData.total}
        page={pageData.page}
        pageSize={pageData.pageSize}
        pageCount={pageData.pageCount}
        currentSort={query.sort}
        currentDir={query.dir}
        nowIso={now.toISOString()}
      />
    </div>
  );
}
