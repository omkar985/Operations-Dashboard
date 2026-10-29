import React from "react";
import type { Kpi } from "@/lib/metrics/compute";
import { TrendIndicator } from "./trend-indicator";
import { Sparkline } from "@/components/charts/sparkline";
import { HelpCircle, AlertCircle } from "lucide-react";

interface KpiLedgerProps {
  kpis: Kpi[];
  className?: string;
}

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
    if (isLead) return "#0EA5E9";
    if (kpi.key === "overdue") return "#EF4444";
    if (kpi.key === "created") return "#00F0FF";
    if (kpi.key === "resolved") return "#10B981";
    if (kpi.key === "sla") return "#F59E0B";
    return "#8B5CF6";
  };

  return (
    <div className={`ledger ${className}`}>
      {kpis.map((kpi, idx) => {
        const isLead = idx === 0;

        return (
          <div
            key={kpi.key}
            data-lead={isLead ? "true" : "false"}
            className="ledger-cell group relative overflow-hidden"
          >
            {isLead && (
              <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#0284C7] via-[#00F0FF] to-transparent" />
            )}

            <div className="flex items-center justify-between gap-1 text-[var(--muted)]">
              <span className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--muted-strong)]">
                {kpi.label}
              </span>
              <span
                className="opacity-40 group-hover:opacity-100 transition-opacity cursor-help"
                title={kpi.definition}
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="my-1.5">
              <div className="ledger-value text-[var(--ink)]">
                {formatVal(kpi)}
              </div>
            </div>

            <div className="ledger-foot">
              {kpi.available ? (
                <>
                  <TrendIndicator
                    deltaPct={kpi.deltaPct}
                    good={kpi.good}
                    unit={kpi.unit === "percent" ? "pp" : "%"}
                  />
                  {kpi.sparkline && kpi.sparkline.length > 1 && (
                    <Sparkline
                      data={kpi.sparkline}
                      color={getSparklineColor(kpi, isLead)}
                    />
                  )}
                </>
              ) : (
                <div
                  className="flex items-center gap-1.5 text-[11px] text-[var(--warning)] font-medium"
                  title={`Missing mapped column(s): ${kpi.missing.join(", ")}`}
                >
                  <AlertCircle className="w-3 h-3 shrink-0" />
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
