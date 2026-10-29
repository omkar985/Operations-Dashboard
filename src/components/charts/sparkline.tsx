"use client";

import React from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import { type ChartThemeTokens } from "./chart-theme";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number | string;
}

export function Sparkline({
  data,
  color,
  height = 28,
  width = 68,
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const getOption = (tokens: ChartThemeTokens): EChartsOption => {
    const stroke = color || tokens.primary;

    return {
      backgroundColor: "transparent",
      grid: { left: 0, right: 0, top: 2, bottom: 2 },
      xAxis: { type: "category", show: false, boundaryGap: false },
      yAxis: { type: "value", show: false },
      series: [
        {
          type: "line",
          data,
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 1.5, color: stroke },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: stroke + "33" },
                { offset: 1, color: stroke + "00" },
              ],
            },
          },
        },
      ],
    };
  };

  return (
    <div style={{ width, height }} className="overflow-hidden inline-block align-middle">
      <BaseChart option={getOption} height={height} />
    </div>
  );
}
