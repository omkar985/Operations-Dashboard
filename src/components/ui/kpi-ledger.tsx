"use client";

import React, { useState } from "react";
import type { Kpi, KpiKey } from "@/lib/metrics/compute";
import { TrendIndicator } from "./trend-indicator";
import { Sparkline } from "@/components/charts/sparkline";
import {
  Info,
  Filter,
  Truck,
  Layers,
  Clock,
  ArrowUpRight,
  RotateCcw,
  TrendingUp,
  Users,
  Palette,
  Sparkles,
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
    filterTitle: string;
    filterRules: { label: string; value: string }[];
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
    filterTitle: "Monthly Orders Filter",
    filterRules: [
      { label: "Sheet Tab", value: '"Above 50k orders"' },
      { label: "Order Date", value: "Within active monthly period" },
      { label: "Order Amount", value: "₹50,000 and above" },
    ],
  },
  not_yet_processed: {
    icon: Clock,
    tag: "Action Required",
    tagStyle: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/50",
    iconStyle: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    glowGradient: "from-amber-500/8 via-amber-500/3 to-transparent",
    sparklineColor: "#F59E0B",
    sublabel: "Awaiting courier assignment",
    filterTitle: "Pending Processing Filter",
    filterRules: [
      { label: "Action taken", value: "Is Blank (no courier/tracking yet)" },
      { label: "Order Status", value: 'Does not contain "Cancelled"' },
    ],
  },
  not_yet_delivered: {
    icon: Truck,
    tag: "In Transit",
    tagStyle: "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/50",
    iconStyle: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    glowGradient: "from-indigo-500/8 via-indigo-500/3 to-transparent",
    sparklineColor: "#6366F1",
    sublabel: "With courier for delivery",
    filterTitle: "Pending Delivery Filter",
    filterRules: [
      { label: "Delivered (yes/no)", value: 'Is not "Yes"' },
      { label: "Tracking Status", value: 'Does not contain "Delivered", "RTO", or "Returns"' },
    ],
  },
  vmoda_waiting_customer: {
    icon: Users,
    tag: "Awaiting Response",
    tagStyle: "bg-sky-50 dark:bg-sky-950/50 text-[#0284C7] dark:text-[#38BDF8] border-sky-200/80 dark:border-sky-800/50",
    iconStyle: "text-[#0284C7] dark:text-[#38BDF8] bg-[#0284C7]/10 border-[#0284C7]/20",
    glowGradient: "from-[#0284C7]/8 via-[#0284C7]/3 to-transparent",
    sparklineColor: "#0284C7",
    sublabel: "Awaiting client design confirmation",
    filterTitle: "Waiting on Customer Filter",
    filterRules: [
      { label: "Sheet Tab", value: '"V-MODA"' },
      { label: "Status Column", value: 'Set to "Waiting on Customer"' },
    ],
  },
  vmoda_waiting_logo: {
    icon: Palette,
    tag: "Design Asset",
    tagStyle: "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/50",
    iconStyle: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
    glowGradient: "from-purple-500/8 via-purple-500/3 to-transparent",
    sparklineColor: "#A855F7",
    sublabel: "Awaiting vector logo artwork",
    filterTitle: "Waiting on Logo Filter",
    filterRules: [
      { label: "Sheet Tab", value: '"V-MODA"' },
      { label: "Status Column", value: 'Set to "Waiting on Logo"' },
    ],
  },
  vmoda_waiting_engraving: {
    icon: Sparkles,
    tag: "Production Queue",
    tagStyle: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/50",
    iconStyle: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    glowGradient: "from-amber-500/8 via-amber-500/3 to-transparent",
    sparklineColor: "#F59E0B",
    sublabel: "Ready for laser engraving machine",
    filterTitle: "Waiting on Engraving Filter",
    filterRules: [
      { label: "Sheet Tab", value: '"V-MODA"' },
      { label: "Status Column", value: 'Set to "Waiting on Engraving"' },
    ],
  },
};

export function KpiLedger({ kpis, className = "", onCardClick }: KpiLedgerProps) {
  const [flippedKeys, setFlippedKeys] = useState<Record<string, boolean>>({});

  const toggleFlip = (key: string) => {
    setFlippedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
          filterTitle: kpi.label,
          filterRules: [{ label: "Criteria", value: kpi.definition }],
        };

        const Icon = config.icon;
        const isClickable = Boolean(onCardClick);
        const isFlipped = Boolean(flippedKeys[kpi.key]);

        return (
          <div key={kpi.key} className="flip-card-container h-full min-h-[220px]">
            <div className={`flip-card-inner ${isFlipped ? "is-flipped" : ""}`}>
              {/* ========================================================
                  FRONT FACE: Metric card with click to open order records
                  ======================================================== */}
              <div
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={() => {
                  if (!isFlipped) onCardClick?.(kpi.key, kpi.label);
                }}
                onKeyDown={(e) => {
                  if (isClickable && !isFlipped && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onCardClick?.(kpi.key, kpi.label);
                  }
                }}
                className={`
                  flip-card-front rounded-2xl p-5 sm:p-6 transition-all duration-300
                  backdrop-blur-xl bg-white/75 dark:bg-slate-900/65
                  border border-white/60 dark:border-white/10
                  shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]
                  hover:shadow-[0_16px_40px_rgba(2,132,199,0.12)]
                  hover:border-[#0284C7]/40 dark:hover:border-[#38BDF8]/40
                  hover:-translate-y-1 group flex flex-col justify-between relative
                  ${isClickable ? "cursor-pointer" : ""}
                `}
              >
                {/* Ambient Background Glow */}
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${config.glowGradient} opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none overflow-hidden`}
                />

                {/* Top row: Icon + Tag on Left; (i) Button & Link Arrow on Right */}
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

                  {/* Right Top Controls: (i) Flip Button + Card Drill-down Arrow */}
                  <div className="flex items-center gap-1.5">
                    {/* (i) Flip Card Button */}
                    <button
                      type="button"
                      aria-label={`Show applied filter for ${kpi.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFlip(kpi.key);
                      }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#0284C7] dark:hover:text-[#38BDF8] bg-slate-100/70 hover:bg-sky-50 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 transition-all cursor-pointer"
                      title="Click to view applied filter"
                    >
                      <Info className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>

                    {/* Drill-down arrow cue */}
                    {isClickable && (
                      <span className="p-1 rounded-lg text-slate-400 group-hover:text-[#0284C7] dark:group-hover:text-[#38BDF8] group-hover:bg-[#0284C7]/10 transition-all">
                        <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Middle Row: Title, Subtitle, Big Hero Number & Sparkline */}
                <div className="relative z-10 mt-4 mb-3">
                  <div>
                    <h3 className="text-[13.5px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight leading-snug">
                      {kpi.label}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                      {config.sublabel}
                    </p>
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

              {/* ========================================================
                  BACK FACE: Flipped card showing applied filter criteria
                  ======================================================== */}
              <div
                className="flip-card-back rounded-2xl p-5 sm:p-6 backdrop-blur-2xl bg-slate-900/95 dark:bg-slate-950/95 text-white border border-slate-700/80 dark:border-white/10 shadow-2xl flex flex-col justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Back Face Header */}
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${config.iconStyle}`}
                    >
                      <Filter className="w-3.5 h-3.5 stroke-[2]" />
                    </div>
                    <div>
                      <span className="text-[10.5px] font-bold text-[#38BDF8] uppercase tracking-wider block">
                        Filter Applied
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {config.filterTitle}
                      </span>
                    </div>
                  </div>

                  {/* Flip Back Button */}
                  <button
                    type="button"
                    onClick={() => toggleFlip(kpi.key)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 transition-all flex items-center gap-1.5 cursor-pointer border border-white/10"
                    title="Flip back to metric"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Back</span>
                  </button>
                </div>

                {/* Back Face Content: Filter Rules */}
                <div className="my-3 space-y-2.5">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    {config.filterRules.map((rule, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0 mt-1.5" />
                        <div className="leading-snug">
                          <span className="text-slate-400 font-medium">{rule.label}: </span>
                          <span className="text-slate-100 font-semibold">{rule.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed px-1">
                    {kpi.definition}
                  </p>
                </div>

                {/* Back Face Footer */}
                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Click Back to return to metric</span>
                  <button
                    type="button"
                    onClick={() => toggleFlip(kpi.key)}
                    className="text-[#38BDF8] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <span>Flip back</span>
                    <span>&larr;</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
