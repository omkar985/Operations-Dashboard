import Link from "next/link";
import { AlertTriangle, ArrowRight, Settings2, RefreshCw } from "lucide-react";
import { getDataset } from "@/server/services/dataset-service";
import { getThresholds } from "@/server/services/settings-service";
import { parseRange } from "@/lib/metrics/range";
import {
  computeKpis,
  buildTrend,
  breakdownBy,
  needsAttention,
  type MetricsConfig,
} from "@/lib/metrics/compute";
import type { FieldKey } from "@/types/operations";
import { KpiLedger } from "@/components/ui/kpi-ledger";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { ChartCard } from "@/components/ui/chart-card";
import { TrendChart } from "@/components/charts/trend-chart";
import { BreakdownBarChart } from "@/components/charts/breakdown-bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { AttentionSection } from "@/components/dashboard/attention-section";

import { LiveRefreshHeader } from "@/components/dashboard/live-refresh-header";

interface DashboardPageProps {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function DashboardPage(props: DashboardPageProps) {
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
        <div className="flex items-center justify-between">
          <h1 className="page-title dm-serif-display-regular">Operations Dashboard</h1>
        </div>
        <EmptyState
          icon={<Settings2 className="w-6 h-6 stroke-[1.5]" />}
          title={
            dataset.missing === "credentials"
              ? "Google Sheets Credentials Missing"
              : "Source Column Mapping Incomplete"
          }
          description={
            dataset.missing === "credentials"
              ? "Configure your Google Sheets service account credentials in the server environment to begin synchronization."
              : "Connect your operational worksheet and map required columns in the Administration panel to activate metrics."
          }
          action={
            <Link href="/admin/source" className="btn btn-primary btn-sm">
              <span>Configure Source &amp; Mapping</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        />
      </div>
    );
  }

  if (dataset.kind === "no_data") {
    return (
      <div className="page space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="page-title dm-serif-display-regular">Operations Dashboard</h1>
        </div>
        <EmptyState
          icon={<RefreshCw className="w-6 h-6 stroke-[1.5]" />}
          title="Initial Synchronization Pending"
          description="Source mapping is configured. The system is waiting for the first synchronization run to pull operational records."
          action={
            <Link href="/admin/system" className="btn btn-primary btn-sm">
              <span>View Sync History &amp; Run Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        />
      </div>
    );
  }

  // Dataset is ready!
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

  const kpis = computeKpis(dataset.records, parsedRange, metricsConfig);
  const trend = buildTrend(dataset.records, parsedRange, metricsConfig);
  const teamBreakdown = breakdownBy(dataset.records, "team", parsedRange, metricsConfig, 6);
  const statusBreakdown = breakdownBy(dataset.records, "status", parsedRange, metricsConfig, 6);
  const priorityBreakdown = breakdownBy(dataset.records, "priority", parsedRange, metricsConfig, 5);
  const attentionItems = needsAttention(dataset.records, metricsConfig, 8);

  const statusDonutData = (statusBreakdown || []).map((s) => ({
    name: s.label,
    value: s.total,
  }));

  const exportUrl = `/api/operations/export?range=${encodeURIComponent(
    parsedRange.key
  )}${parsedRange.key === "custom" ? `&from=${parsedRange.fromInput}&to=${parsedRange.toInput}` : ""}`;

  return (
    <div className="page space-y-6">
      {/* Top Header Row: Brand Title & Live Telemetry Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title dm-serif-display-regular">Operations Dashboard</h1>
          <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 mt-1">
            {parsedRange.label} &bull; in progress &bull; {dataset.records.length.toLocaleString()} total operational records
          </p>
        </div>

        <LiveRefreshHeader exportUrl={exportUrl} />
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeFilter currentRange={parsedRange} />
      </div>

      {/* Sync Warnings Banner */}
      {dataset.warnings && dataset.warnings.length > 0 && (
        <div
          role="status"
          className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <span className="font-semibold">Sync notice: </span>
            {dataset.warnings[0].message}
            {dataset.warnings.length > 1 && (
              <span className="ml-1 text-amber-700 dark:text-amber-300">
                (+{dataset.warnings.length - 1} more warnings)
              </span>
            )}
          </div>
        </div>
      )}

      {/* 1. Continuous Instrument KPI Strip */}
      <KpiLedger kpis={kpis} />

      {/* 2. Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="Operational Inflow vs Resolution"
          subtitle="New incoming records, completions, and cumulative backlog over time"
          className="lg:col-span-2"
        >
          <TrendChart data={trend} height={310} showBacklog={true} />
        </ChartCard>

        <ChartCard
          title="Workload by Team"
          subtitle="Total, open, and overdue item distribution"
          className="lg:col-span-1"
        >
          <BreakdownBarChart data={teamBreakdown} height={310} horizontal={true} />
        </ChartCard>
      </div>

      {/* 3. Status & Priority Proportions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartCard
          title="Status Breakdown"
          subtitle="Proportion of items in each lifecycle state"
        >
          <DonutChart
            data={statusDonutData}
            height={270}
            centerText={`${kpis.find((k) => k.key === "open")?.value?.toLocaleString() ?? "—"}`}
            subText="Open items"
          />
        </ChartCard>

        <ChartCard
          title="Priority Volume"
          subtitle="Open records categorized by operational severity"
        >
          <BreakdownBarChart data={priorityBreakdown} height={270} horizontal={false} />
        </ChartCard>
      </div>

      {/* 4. Attention Needed Table */}
      <AttentionSection items={attentionItems} />
    </div>
  );
}
