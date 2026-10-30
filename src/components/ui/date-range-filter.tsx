"use client";

import React, { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import { RANGE_PRESETS, type ParsedRange } from "@/lib/metrics/range";

interface DateRangeFilterProps {
  currentRange: ParsedRange;
  className?: string;
}

export function DateRangeFilter({ currentRange, className = "" }: DateRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openCustom, setOpenCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(currentRange.fromInput);
  const [customTo, setCustomTo] = useState(currentRange.toInput);

  const applyRange = (key: string) => {
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.set("range", key);
    next.delete("from");
    next.delete("to");
    next.delete("page"); // reset pagination on range change
    router.push(`${pathname}?${next.toString()}`);
  };

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFrom || !customTo) return;
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.set("range", "custom");
    next.set("from", customFrom);
    next.set("to", customTo);
    next.delete("page");
    setOpenCustom(false);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className={`relative inline-flex items-center gap-1 ${className}`}>
      <div className="segmented">
        {RANGE_PRESETS.map((p) => {
          const active = currentRange.key === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyRange(p.key)}
              aria-pressed={active}
              className={`transition-colors ${
                active
                  ? "text-[#0284C7] dark:text-[#38BDF8] font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {p.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOpenCustom((v) => !v)}
          aria-pressed={currentRange.key === "custom" || openCustom}
          aria-expanded={openCustom}
          className={`flex items-center gap-1 transition-colors ${
            currentRange.key === "custom"
              ? "text-[#0284C7] dark:text-[#38BDF8] font-semibold"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
          title="Custom date range"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {currentRange.key === "custom" ? currentRange.label : "Custom"}
          </span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {openCustom && (
        <form
          onSubmit={applyCustom}
          className="absolute right-0 top-full mt-2 z-40 p-4 rounded-lg bg-[var(--card)] border border-[var(--line)] shadow-pop w-72 space-y-3"
        >
          <div className="text-xs font-semibold text-[var(--ink)]">Select custom range</div>
          <div className="grid gap-2">
            <div className="field">
              <label htmlFor="range-from-input" className="label text-[11px]">From date</label>
              <input
                id="range-from-input"
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="input text-xs h-8"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="range-to-input" className="label text-[11px]">To date</label>
              <input
                id="range-to-input"
                type="date"
                value={customTo}
                min={customFrom}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setCustomTo(e.target.value)}
                className="input text-xs h-8"
                required
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--line-subtle)]">
            <button
              type="button"
              onClick={() => setOpenCustom(false)}
              className="btn btn-ghost btn-sm text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm text-xs">
              Apply
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
