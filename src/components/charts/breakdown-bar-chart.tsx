"use client";

import React from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import { getBaseChartOption, type ChartThemeTokens } from "./chart-theme";
import type { BreakdownRow } from "@/lib/metrics/compute";

interface BreakdownBarChartProps {
  data: BreakdownRow[] | null;
  height?: number;
  horizontal?: boolean;
}

export function BreakdownBarChart({
  data,
  height = 300,
  horizontal = true,
}: BreakdownBarChartProps) {
  const hasData = Boolean(data && data.length > 0);

  const getOption = (tokens: ChartThemeTokens): EChartsOption => {
    const base = getBaseChartOption(tokens);
    const rows = data ? (horizontal ? [...data].reverse() : data) : [];

    const categories = rows.map((r) => r.label);
    const totals = rows.map((r) => r.total);
    const opens = rows.map((r) => r.open ?? 0);
    const overdues = rows.map((r) => r.overdue ?? 0);

    const hasOpen = rows.some((r) => r.open !== null);
    const hasOverdue = rows.some((r) => r.overdue !== null && r.overdue > 0);

    const series: EChartsOption["series"] = [];

    if (hasOpen) {
      series.push({
        name: "Open",
        type: "bar",
        data: opens,
        itemStyle: { color: tokens.primary, borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
        barMaxWidth: 20,
      });
    } else {
      series.push({
        name: "Total",
        type: "bar",
        data: totals,
        itemStyle: { color: tokens.primary, borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
        barMaxWidth: 20,
      });
    }

    if (hasOverdue) {
      series.push({
        name: "Overdue",
        type: "bar",
        data: overdues,
        itemStyle: { color: tokens.palette[5], borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] }, // red #EF4444
        barMaxWidth: 20,
      });
    }

    const catAxis = {
      type: "category" as const,
      data: categories,
      axisLine: { lineStyle: { color: tokens.lineSubtle } },
      axisTick: { show: false },
      axisLabel: {
        color: tokens.muted,
        fontSize: 11,
        formatter: (val: string) => (val.length > 18 ? `${val.slice(0, 16)}…` : val),
      },
    };

    const valAxis = {
      type: "value" as const,
      minInterval: 1,
      splitLine: { lineStyle: { color: tokens.lineSubtle, type: "dashed" as const } },
      axisLabel: { color: tokens.muted, fontSize: 11 },
    };

    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      legend: {
        top: 0,
        right: 12,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: tokens.muted, fontSize: 11 },
      },
      xAxis: (horizontal ? valAxis : catAxis) as EChartsOption["xAxis"],
      yAxis: (horizontal ? catAxis : valAxis) as EChartsOption["yAxis"],
      series,
    };
  };

  return <BaseChart option={getOption} height={height} empty={!hasData} />;
}
