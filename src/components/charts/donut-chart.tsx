"use client";

import React from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import { getBaseChartOption, type ChartThemeTokens } from "./chart-theme";

interface DonutItem {
  name: string;
  value: number;
}

interface DonutChartProps {
  data: DonutItem[];
  height?: number;
  centerText?: string;
  subText?: string;
}

export function DonutChart({
  data,
  height = 280,
  centerText,
  subText,
}: DonutChartProps) {
  const hasData = data.length > 0 && data.some((d) => d.value > 0);

  const getOption = (tokens: ChartThemeTokens): EChartsOption => {
    const base = getBaseChartOption(tokens);

    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { name?: string; value?: number; percent?: number };
          return `<div style="font-weight:600;margin-bottom:2px;">${p.name ?? ""}</div>
                  <div style="font-size:12px;color:${tokens.muted};">
                    ${(p.value ?? 0).toLocaleString()} items (${p.percent ?? 0}%)
                  </div>`;
        },
      },
      legend: {
        bottom: 0,
        left: "center",
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: tokens.muted, fontSize: 11 },
      },
      graphic: (centerText || subText
        ? [
            {
              type: "text",
              left: "center",
              top: "43%",
              style: {
                text: centerText || "",
                fill: tokens.ink,
                fontSize: 22,
                fontWeight: 650,
                align: "center",
              },
            },
            {
              type: "text",
              left: "center",
              top: "52%",
              style: {
                text: subText || "",
                fill: tokens.muted,
                fontSize: 11,
                align: "center",
              },
            },
          ]
        : undefined) as EChartsOption["graphic"],
      series: [
        {
          type: "pie",
          radius: ["55%", "76%"],
          center: ["50%", "48%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 4,
            borderColor: tokens.card,
            borderWidth: 2,
          },
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 5,
          },
          data,
        },
      ],
    };
  };

  return <BaseChart option={getOption} height={height} empty={!hasData} />;
}
