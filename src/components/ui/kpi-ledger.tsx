import React from "react";
import type { Kpi } from "@/lib/metrics/compute";
import { TrendIndicator } from "./trend-indicator";
import { Sparkline } from "@/components/charts/sparkline";
import {
  HelpCircle,
  AlertCircle,
  Folder,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Layers,
  Truck,
} from "lucide-react";

interface KpiLedgerProps {
  kpis: Kpi[];
  className?: string;
}

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  not_yet_processed: AlertCircle,
  not_yet_delivered: Truck,
  open: Folder,
  created: Layers,
  resolved: CheckCircle2,
  overdue: AlertTriangle,
  sla: ShieldCheck,
  ttr: Clock,
};

const KPI_ICON_STYLES: Record<string, string> = {
  not_yet_processed: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
  not_yet_delivered: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  open: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
  created: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20",
  resolved: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  overdue: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
  sla: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
  ttr: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
};

export function KpiLedger({ kpis, className = "" }: KpiLedgerProps) {
  const formatVal = (kpi: Kpi) => {
    if (!kpi.available || kpi.value === null) return "—";
    if (kpi.unit === "percent") return `${kpi.value.toFixed(1)}%`;
    if (kpi.unit === "hours") {
      if (kpi.value < 1) return `${Math.round(kpi.value * 60)}m`;
      if (kpi.value < 48) return `${kpi.value.toFixed(1)}h`;
      return `${(kpi.value / 24).toFixed(1)}d`;
    }
    return kpi.value.toLocaleString();
  };

  const getSparklineColor = (kpi: Kpi, isLead: boolean) => {
    if (kpi.key === "not_yet_processed") return "#F59E0B";
    if (kpi.key === "not_yet_delivered") return "#6366F1";
    if (isLead) return "#0EA5E9";
    if (kpi.key === "overdue") return "#EF4444";
    if (kpi.key === "created") return "#0EA5E9";
    if (kpi.key === "resolved") return "#10B981";
    if (kpi.key === "sla") return "#F59E0B";
    return "#8B5CF6";
  };

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {kpis.map((kpi, idx) => {
        const isLead = idx === 0;
        const Icon = KPI_ICONS[kpi.key] || TrendingUp;
        const iconStyle =
          KPI_ICON_STYLES[kpi.key] || "text-[var(--primary-ink)] bg-[var(--raised)] border-[var(--line)]";

        return (
          <div
            key={kpi.key}
            className="card p-4 sm:p-4.5 flex flex-col justify-between relative overflow-hidden group hover:border-[var(--line-hover)] transition-all bg-[var(--card)] border border-[var(--line)] rounded-2xl shadow-xs"
          >
            {/* Top row: Category Icon + (i) Tooltip */}
            <div className="flex items-center justify-between">
              <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${iconStyle}`}>
                <Icon className="w-3.5 h-3.5 stroke-[2]" />
              </div>
              <span
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-help p-0.5"
                title={kpi.definition}
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </div>

            {/* Label */}
            <div className="mt-2.5">
              <span className="text-[12px] sm:text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 line-clamp-1">
                {kpi.label}
              </span>
            </div>

            {/* Value + Sparkline */}
            <div className="flex items-baseline justify-between gap-2 my-2">
              <div className="text-[26px] sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
                {formatVal(kpi)}
              </div>
              {kpi.available && kpi.sparkline && kpi.sparkline.length > 1 && (
                <Sparkline
                  data={kpi.sparkline}
                  width={68}
                  height={26}
                  color={getSparklineColor(kpi, isLead)}
                />
              )}
            </div>

            {/* Footer: Trend Delta vs Prior Period or Missing Field warning */}
            <div className="pt-2 border-t border-[var(--line-subtle)]/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              {kpi.available ? (
                <>
                  <TrendIndicator deltaPct={kpi.deltaPct} good={kpi.good} />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto truncate">
                    vs. prior
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-1 text-slate-400 text-[10.5px]">
                  <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="truncate">Requires: {kpi.missing.join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
