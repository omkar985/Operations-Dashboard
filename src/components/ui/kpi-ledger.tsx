"use client";

import React from "react";
import type { Kpi, KpiKey } from "@/lib/metrics/compute";
import { TrendIndicator } from "./trend-indicator";
import { Sparkline } from "@/components/charts/sparkline";
import {
  HelpCircle,
  AlertCircle,
  Truck,
  Layers,
  Clock,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";

interface KpiLedgerProps {
  kpis: Kpi[];
  className?: string;
  onCardClick?: (key: KpiKey, label: string) => void;
}

const KPI_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    tag: string;
    tagStyle: string;
    iconStyle: string;
    glowGradient: string;
    sparklineColor: string;
    sublabel: string;
  }
> = {
  monthly_received: {
    icon: Layers,
    tag: "High-Value Intake",
    tagStyle: "bg-sky-50 dark:bg-sky-950/50 text-[#0284C7] dark:text-[#38BDF8] border-sky-200/80 dark:border-sky-800/50",
    iconStyle: "text-[#0284C7] dark:text-[#38BDF8] bg-[#0284C7]/10 border-[#0284C7]/20",
    glowGradient: "from-[#0284C7]/8 via-[#0284C7]/3 to-transparent",
    sparklineColor: "#0284C7",
    sublabel: "Above ₹50,000 threshold",
  },
  not_yet_processed: {
    icon: Clock,
    tag: "Action Required",
    tagStyle: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/50",
    iconStyle: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    glowGradient: "from-amber-500/8 via-amber-500/3 to-transparent",
    sparklineColor: "#F59E0B",
    sublabel: "Awaiting courier assignment",
  },
  not_yet_delivered: {
    icon: Truck,
    tag: "In Transit",
    tagStyle: "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/50",
    iconStyle: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    glowGradient: "from-indigo-500/8 via-indigo-500/3 to-transparent",
    sparklineColor: "#6366F1",
    sublabel: "With courier for delivery",
  },
};

export function KpiLedger({ kpis, className = "", onCardClick }: KpiLedgerProps) {
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

  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-5 ${className}`}>
      {kpis.map((kpi) => {
        const config = KPI_CONFIG[kpi.key] || {
          icon: TrendingUp,
          tag: "Operational",
          tagStyle: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200",
          iconStyle: "text-[#0284C7] bg-[#0284C7]/10 border-[#0284C7]/20",
          glowGradient: "from-slate-500/5 to-transparent",
          sparklineColor: "#0284C7",
          sublabel: "High value orders",
        };

        const Icon = config.icon;
        const isClickable = Boolean(onCardClick);

        return (
          <div
            key={kpi.key}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onClick={() => onCardClick?.(kpi.key, kpi.label)}
            onKeyDown={(e) => {
              if (isClickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onCardClick?.(kpi.key, kpi.label);
              }
            }}
            className={`
              relative overflow-hidden rounded-2xl p-5 sm:p-6 transition-all duration-300
              backdrop-blur-xl bg-white/75 dark:bg-slate-900/65
              border border-white/60 dark:border-white/10
              shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]
              hover:shadow-[0_16px_40px_rgba(2,132,199,0.12)]
              hover:border-[#0284C7]/40 dark:hover:border-[#38BDF8]/40
              hover:-translate-y-1 group flex flex-col justify-between
              ${isClickable ? "cursor-pointer" : ""}
            `}
          >
            {/* Ambient Background Glow */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${config.glowGradient} opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none`}
            />

            {/* Top row: Icon + Pill Tag + Details arrow */}
            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-xs ${config.iconStyle}`}
                >
                  <Icon className="w-4 h-4 stroke-[2]" />
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border tracking-wide uppercase ${config.tagStyle}`}
                >
                  {config.tag}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span
                  className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-help p-0.5"
                  title={kpi.definition}
                  onClick={(e) => e.stopPropagation()}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </span>
                {isClickable && (
                  <span className="p-1 rounded-lg text-slate-400 group-hover:text-[#0284C7] dark:group-hover:text-[#38BDF8] group-hover:bg-[#0284C7]/10 transition-all">
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                )}
              </div>
            </div>

            {/* Middle Row: Title, Subtitle, Big Hero Number & Sparkline */}
            <div className="relative z-10 mt-4 mb-3">
              <div className="flex items-baseline justify-between gap-1">
                <div>
                  <h3 className="text-[13.5px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight leading-snug">
                    {kpi.label}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                    {config.sublabel}
                  </p>
                </div>
              </div>

              {/* Big Metric Display */}
              <div className="flex items-baseline justify-between gap-2 mt-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
                    {formatVal(kpi)}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 lowercase">
                    {kpi.value === 1 ? "order" : "orders"}
                  </span>
                </div>

                {kpi.available && kpi.sparkline && kpi.sparkline.length > 1 && (
                  <div className="shrink-0 pt-1">
                    <Sparkline
                      data={kpi.sparkline}
                      width={80}
                      height={28}
                      color={config.sparklineColor}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row: Total Value Pill & Prior Period Trend */}
            <div className="relative z-10 pt-3 border-t border-slate-200/50 dark:border-white/5 flex items-center justify-between text-xs">
              {kpi.totalAmount !== undefined && kpi.totalAmount > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                  ₹{kpi.totalAmount.toLocaleString("en-IN")} Total
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                  High-value orders
                </span>
              )}

              {kpi.available && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <TrendIndicator deltaPct={kpi.deltaPct} good={kpi.good} />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    vs. prior
                  </span>
                </div>
              )}
            </div>

            {/* Interactive Click Cue on Hover */}
            {isClickable && (
              <div className="relative z-10 mt-2 text-[10.5px] font-semibold text-[#0284C7] dark:text-[#38BDF8] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-0.5">
                <span>View records</span>
                <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
