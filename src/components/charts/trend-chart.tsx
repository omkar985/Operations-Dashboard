"use client";

import React from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import { getBaseChartOption, type ChartThemeTokens } from "./chart-theme";
import type { TrendPoint } from "@/lib/metrics/compute";

interface TrendChartProps {
  data: TrendPoint[];
  height?: number;
  showBacklog?: boolean;
}

export function TrendChart({ data, height = 320, showBacklog = true }: TrendChartProps) {
  const hasData = data.length > 0 && data.some((d) => d.created > 0 || d.resolved > 0 || (d.backlog ?? 0) > 0);

  const getOption = (tokens: ChartThemeTokens): EChartsOption => {
    const base = getBaseChartOption(tokens);
    const dates = data.map((d) => {
      const dt = new Date(d.t);
      return `${dt.getUTCDate()} ${dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`;
    });

    const series: EChartsOption["series"] = [
      {
        name: "Created",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        symbolSize: 6,
        data: data.map((d) => d.created),
        itemStyle: { color: tokens.cyan },
        lineStyle: { width: 2.5, color: tokens.cyan },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(56, 189, 248, 0.22)" },
              { offset: 1, color: "rgba(56, 189, 248, 0.0)" },
            ],
          },
        },
      },
      {
        name: "Resolved",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        symbolSize: 6,
        data: data.map((d) => d.resolved),
        itemStyle: { color: tokens.palette[2] }, // teal #14B8A6
        lineStyle: { width: 2.5, color: tokens.palette[2] },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(20, 184, 166, 0.22)" },
              { offset: 1, color: "rgba(20, 184, 166, 0.0)" },
            ],
          },
        },
      },
    ];

    const hasBacklogValues = showBacklog && data.some((d) => d.backlog !== null);

    if (hasBacklogValues) {
      series.push({
        name: "Backlog",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        symbolSize: 6,
        lineStyle: { width: 2, type: "dashed", color: tokens.primary },
        itemStyle: { color: tokens.primary },
        data: data.map((d) => d.backlog ?? 0),
      });
    }

    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: "axis",
        axisPointer: {
          type: "cross",
          crossStyle: { color: tokens.line },
          lineStyle: { color: tokens.lineSubtle },
        },
      },
      legend: {
        top: 4,
        right: 12,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: tokens.muted, fontSize: 12 },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: tokens.lineSubtle } },
        axisTick: { show: false },
        axisLabel: { color: tokens.muted, fontSize: 11, margin: 10 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: tokens.lineSubtle, type: "dashed" } },
        axisLabel: { color: tokens.muted, fontSize: 11 },
      },
      series,
    };
  };

  return <BaseChart option={getOption} height={height} empty={!hasData} />;
}
