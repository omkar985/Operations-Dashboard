import Link from "next/link";
import { Gauge, Clock, ShieldCheck, Settings2, RefreshCw } from "lucide-react";
import { getDataset } from "@/server/services/dataset-service";
import { getThresholds } from "@/server/services/settings-service";
import { parseRange } from "@/lib/metrics/range";
import {
  ageingBins,
  resolutionBins,
  breakdownBy,
  type MetricsConfig,
} from "@/lib/metrics/compute";
import type { FieldKey } from "@/types/operations";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartCard } from "@/components/ui/chart-card";
import { DistributionBarChart } from "@/components/charts/distribution-bar-chart";
import { DateRangeFilter } from "@/components/ui/date-range-filter";

interface ReportsPageProps {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function ReportsPage(props: ReportsPageProps) {
  const params = await props.searchParams;
  const now = new Date();
  const parsedRange = parseRange(params, now, "30d");

  const [dataset, thresholds] = await Promise.all([
    getDataset(),
    getThresholds(),
  ]);

  if (dataset.kind === "not_configured") {
    return (
      <div className="page space-y-6">
        <h1 className="page-title">Analytics &amp; SLA</h1>
        <EmptyState
          icon={<Settings2 className="w-6 h-6 stroke-[1.5]" />}
          title="Source Not Configured"
          description="Connect and map your operational Google Sheet to unlock SLA and resolution analytics."
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
        <h1 className="page-title">Analytics &amp; SLA</h1>
        <EmptyState
          icon={<RefreshCw className="w-6 h-6 stroke-[1.5]" />}
          title="No Operational Data"
          description="Awaiting initial data synchronization."
          action={
            <Link href="/admin/system" className="btn btn-primary btn-sm">
              View Sync Runs
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

  const ageing = ageingBins(dataset.records, metricsConfig);
  const resolution = resolutionBins(dataset.records, parsedRange, metricsConfig);
  const teamPerformance = breakdownBy(dataset.records, "team", parsedRange, metricsConfig, 12);

  // Compute aggregate SLA on-time rate for the range
  const resolvedWithDue = dataset.records.filter((r) => {
    if (!r.resolvedAt || !r.dueAt) return false;
    const t = Date.parse(r.resolvedAt);
    return t >= parsedRange.from.getTime() && t < parsedRange.to.getTime();
  });

  const onTimeCount = resolvedWithDue.filter(
    (r) => Date.parse(r.resolvedAt!) <= Date.parse(r.dueAt!)
  ).length;

  const overallSlaPct =
    resolvedWithDue.length > 0 ? (onTimeCount / resolvedWithDue.length) * 100 : null;

  return (
    <div className="page space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Analytics &amp; SLA</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Service Level Agreement compliance, resolution distributions, and team performance
          </p>
        </div>

        <DateRangeFilter currentRange={parsedRange} />
      </div>

      {/* SLA Executive Scorecard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="panel p-5 flex items-center justify-between">
          <div>
            <div className="eyebrow text-[10px]">Overall SLA Compliance</div>
            <div className="text-3xl font-bold tracking-tight text-[var(--ink)] mt-1 tnum">
              {overallSlaPct !== null ? `${overallSlaPct.toFixed(1)}%` : "—"}
            </div>
            <div className="text-xs text-[var(--muted)] mt-1">
              {resolvedWithDue.length.toLocaleString()} resolved items with due date
            </div>
          </div>
          <div
            className={`flex items-center justify-center w-12 h-12 rounded-xl ${
              overallSlaPct === null
                ? "bg-[var(--raised)] text-[var(--muted)]"
                : overallSlaPct >= thresholds.slaTargetPercent
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
            }`}
          >
            <Gauge className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        <div className="panel p-5 flex items-center justify-between">
          <div>
            <div className="eyebrow text-[10px]">Target Benchmark</div>
            <div className="text-3xl font-bold tracking-tight text-[var(--ink)] mt-1 tnum">
              {thresholds.slaTargetPercent}%
            </div>
            <div className="text-xs text-[var(--muted)] mt-1">
              Configured SLA performance threshold
            </div>
          </div>
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <ShieldCheck className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        <div className="panel p-5 flex items-center justify-between">
          <div>
            <div className="eyebrow text-[10px]">Overdue Threshold</div>
            <div className="text-3xl font-bold tracking-tight text-[var(--ink)] mt-1 tnum">
              {thresholds.ageingDays}d
            </div>
            <div className="text-xs text-[var(--muted)] mt-1">
              {ageing?.overThreshold ?? 0} open items currently exceed ageing limit
            </div>
          </div>
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
            <Clock className="w-6 h-6 stroke-[2]" />
          </div>
        </div>
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Current Backlog Ageing"
          subtitle="Distribution of open items by days elapsed since creation"
        >
          <DistributionBarChart
            data={ageing?.bins ?? null}
            height={240}
            highlightThresholdIdx={4}
          />
        </ChartCard>

        <ChartCard
          title="Time to Resolve (TTR) Distribution"
          subtitle="Hours or days required to complete records resolved within selected period"
        >
          <DistributionBarChart
            data={resolution}
            height={240}
          />
        </ChartCard>
      </div>

      {/* Team SLA Performance Ledger */}
      <div className="panel overflow-hidden">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Team Performance Breakdown</h2>
            <p className="panel-sub">
              Operational metrics and SLA compliance rates organized by department
            </p>
          </div>
        </div>

        <div className="table-wrap" data-lenis-prevent>
          <table className="table">
            <thead>
              <tr>
                <th className="min-w-[220px]">Team / Department</th>
                <th className="w-32 num">Total Inflow</th>
                <th className="w-32 num">Open Items</th>
                <th className="w-28 num">Overdue</th>
                <th className="w-36 num">SLA Compliance</th>
              </tr>
            </thead>
            <tbody>
              {teamPerformance && teamPerformance.length > 0 ? (
                teamPerformance.map((t) => {
                  const hasSla = t.onTimePct !== null;
                  const isHealthy = hasSla && t.onTimePct! >= thresholds.slaTargetPercent;
                  return (
                    <tr key={t.label}>
                      <td className="font-semibold text-xs text-[var(--ink)]">
                        {t.label}
                      </td>
                      <td className="num font-mono text-xs text-[var(--muted-strong)]">
                        {t.total.toLocaleString()}
                      </td>
                      <td className="num font-mono text-xs text-[var(--muted-strong)]">
                        {t.open !== null ? t.open.toLocaleString() : "—"}
                      </td>
                      <td className="num font-mono text-xs">
                        {t.overdue && t.overdue > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-bold">
                            {t.overdue}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">0</span>
                        )}
                      </td>
                      <td className="num font-mono text-xs font-semibold">
                        {hasSla ? (
                          <span
                            className={
                              isHealthy
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }
                          >
                            {t.onTimePct!.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[var(--muted)] font-normal">N/A</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-[var(--muted)]">
                    No team breakdown data available for this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
