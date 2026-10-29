import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendIndicatorProps {
  deltaPct: number | null | undefined;
  good?: "up" | "down";
  unit?: "%" | "pp";
  className?: string;
}

export function TrendIndicator({
  deltaPct,
  good = "up",
  unit = "%",
  className = "",
}: TrendIndicatorProps) {
  if (deltaPct === null || deltaPct === undefined) {
    return (
      <span className={`inline-flex items-center text-xs text-[var(--muted)] ${className}`}>
        <Minus className="w-3 h-3 mr-0.5 opacity-60" />
        <span>No prior data</span>
      </span>
    );
  }

  const isZero = Math.abs(deltaPct) < 0.1;
  if (isZero) {
    return (
      <span className={`inline-flex items-center text-xs text-[var(--muted)] font-medium ${className}`}>
        <Minus className="w-3 h-3 mr-0.5" />
        <span>0{unit} vs prev</span>
      </span>
    );
  }

  const isUp = deltaPct > 0;
  const isPositive = (isUp && good === "up") || (!isUp && good === "down");

  const colorClass = isPositive ? "text-[var(--success)]" : "text-[var(--error)]";
  const Icon = isUp ? TrendingUp : TrendingDown;
  const sign = isUp ? "+" : "";

  return (
    <span className={`inline-flex items-center text-xs font-semibold tnum ${colorClass} ${className}`}>
      <Icon className="w-3.5 h-3.5 mr-0.5 shrink-0" />
      <span>
        {sign}
        {deltaPct.toFixed(1)}
        {unit} vs prev
      </span>
    </span>
  );
}
