"use client";

import React from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import { getBaseChartOption, type ChartThemeTokens } from "./chart-theme";
import type { Bin } from "@/lib/metrics/compute";

interface DistributionBarChartProps {
  data: Bin[] | null;
  height?: number;
  highlightThresholdIdx?: number;
}

export function DistributionBarChart({
  data,
  height = 240,
  highlightThresholdIdx,
}: DistributionBarChartProps) {
  const hasData = Boolean(data && data.some((b) => b.count > 0));

  const getOption = (tokens: ChartThemeTokens): EChartsOption => {
    const base = getBaseChartOption(tokens);
    const bins = data || [];

    const categories = bins.map((b) => b.label);
    const values = bins.map((b, idx) => {
      const isCritical = highlightThresholdIdx !== undefined && idx >= highlightThresholdIdx;
      return {
        value: b.count,
        itemStyle: {
          color: isCritical ? tokens.palette[5] : tokens.cyan, // red or cyan
          borderRadius: [3, 3, 0, 0],
        },
      };
    });

    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const item = arr[0] as { name?: string; value?: number } | undefined;
          return `<div style="font-weight:600;">${item?.name ?? ""}</div>
                  <div style="font-size:12px;color:${tokens.muted};margin-top:2px;">
                    ${item?.value ?? 0} items
                  </div>`;
        },
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLine: { lineStyle: { color: tokens.lineSubtle } },
        axisTick: { show: false },
        axisLabel: { color: tokens.muted, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: tokens.lineSubtle, type: "dashed" } },
        axisLabel: { color: tokens.muted, fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          data: values,
          barMaxWidth: 28,
        },
      ],
    };
  };

  return <BaseChart option={getOption} height={height} empty={!hasData} />;
}
