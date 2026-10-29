"use client";

import React, { useSyncExternalStore, useRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useTheme } from "@/components/providers/theme-provider";
import { getChartThemeTokens, type ChartThemeTokens } from "./chart-theme";
import { BarChart3 } from "lucide-react";

interface BaseChartProps {
  option: (tokens: ChartThemeTokens) => EChartsOption;
  height?: number | string;
  empty?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

const emptySubscribe = () => () => {};

export function BaseChart({
  option,
  height = 300,
  empty = false,
  emptyMessage = "No data available for the selected period",
  loading = false,
  className = "",
}: BaseChartProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const chartRef = useRef<ReactECharts>(null);

  const isDark = resolvedTheme === "dark";
  const tokens = getChartThemeTokens(isDark);

  if (!mounted) {
    return (
      <div
        className={`w-full flex items-center justify-center bg-[var(--raised)] rounded-[var(--radius-md)] skeleton ${className}`}
        style={{ height }}
      />
    );
  }

  if (empty) {
    return (
      <div
        className={`w-full flex flex-col items-center justify-center border border-dashed border-[var(--line-subtle)] rounded-[var(--radius-md)] p-6 text-center ${className}`}
        style={{ height }}
      >
        <BarChart3 className="w-8 h-8 text-[var(--muted)] opacity-60 mb-2" />
        <p className="text-xs text-[var(--muted)] max-w-xs">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`w-full relative ${className}`} style={{ height }}>
      {loading && (
        <div className="absolute inset-0 z-10 bg-[var(--card)]/60 backdrop-blur-[2px] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full spin" />
        </div>
      )}
      <ReactECharts
        ref={chartRef}
        option={option(tokens)}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "svg" }}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
}
