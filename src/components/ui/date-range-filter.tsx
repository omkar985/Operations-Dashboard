"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { RANGE_PRESETS, type ParsedRange } from "@/lib/metrics/range";

interface DateRangeFilterProps {
  currentRange: ParsedRange;
  className?: string;
}

// Format YYYY-MM-DD
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Display format e.g. "01 Oct 2026"
function toDisplayDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function DateRangeFilter({ currentRange, className = "" }: DateRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const popoverRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(currentRange.fromInput);
  const [endDate, setEndDate] = useState(currentRange.toInput);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Calendar view month & year (defaults to month of endDate or today)
  const initialDate = currentRange.toInput ? new Date(currentRange.toInput) : new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  // Sync state when currentRange changes
  useEffect(() => {
    setStartDate(currentRange.fromInput);
    setEndDate(currentRange.toInput);
    const d = currentRange.toInput ? new Date(currentRange.toInput) : new Date();
    if (!Number.isNaN(d.getTime())) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [currentRange]);

  // Click outside listener to close popover
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const applyPresetKey = (key: string) => {
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.set("range", key);
    next.delete("from");
    next.delete("to");
    next.delete("page");
    setIsOpen(false);
    router.push(`${pathname}?${next.toString()}`);
  };

  const applyCustomRange = (from: string, to: string) => {
    if (!from || !to) return;
    let s = from;
    let e = to;
    if (s > e) [s, e] = [e, s];
    const today = toIsoDate(new Date());
    if (s > today) s = today;
    if (e > today) e = today;
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.set("range", "custom");
    next.set("from", s);
    next.set("to", e);
    next.delete("page");
    setIsOpen(false);
    router.push(`${pathname}?${next.toString()}`);
  };

  // Month navigation
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    const now = new Date();
    if (viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth >= now.getMonth())) {
      return;
    }
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Calendar day cells generation
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  // Days from previous month
  const prevMonthDaysCount = new Date(viewYear, viewMonth, 0).getDate();
  const prevMonthCells: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDaysCount - i;
    const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
    prevMonthCells.push({
      day: d,
      dateStr: toIsoDate(new Date(prevY, prevM, d)),
      isCurrentMonth: false,
    });
  }

  // Days of current month
  const currentMonthCells: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    currentMonthCells.push({
      day: d,
      dateStr: toIsoDate(new Date(viewYear, viewMonth, d)),
      isCurrentMonth: true,
    });
  }

  // Days of next month to fill 42 cells total (6 rows of 7)
  const remaining = 42 - (prevMonthCells.length + currentMonthCells.length);
  const nextMonthCells: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];
  for (let d = 1; d <= remaining; d++) {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    nextMonthCells.push({
      day: d,
      dateStr: toIsoDate(new Date(nextY, nextM, d)),
      isCurrentMonth: false,
    });
  }

  const allCells = [...prevMonthCells, ...currentMonthCells, ...nextMonthCells];

  // Handle cell click
  const handleDateClick = (dateStr: string) => {
    const today = toIsoDate(new Date());
    if (dateStr > today) return; // Disallow selecting future dates

    if (!startDate || (startDate && endDate)) {
      // Starting new selection
      setStartDate(dateStr);
      setEndDate("");
      setHoverDate(null);
    } else {
      // Completing selection
      let s = startDate;
      let e = dateStr;
      if (s > e) [s, e] = [e, s];
      if (e > today) e = today;
      setStartDate(s);
      setEndDate(e);
      setHoverDate(null);
    }
  };

  // Quick Preset Handlers
  const setQuickRange = (type: "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth") => {
    const now = new Date();
    let from = new Date();
    let to = new Date();

    if (type === "today") {
      // today
    } else if (type === "yesterday") {
      from.setDate(now.getDate() - 1);
      to.setDate(now.getDate() - 1);
    } else if (type === "last7") {
      from.setDate(now.getDate() - 6);
    } else if (type === "last30") {
      from.setDate(now.getDate() - 29);
    } else if (type === "thisMonth") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = now;
    } else if (type === "lastMonth") {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    const fromIso = toIsoDate(from);
    const toIso = toIsoDate(to);
    setStartDate(fromIso);
    setEndDate(toIso);
    setViewYear(to.getFullYear());
    setViewMonth(to.getMonth());
  };

  const isCustomActive = currentRange.key === "custom";
  const displayLabel = isCustomActive
    ? `${toDisplayDate(currentRange.fromInput)} – ${toDisplayDate(currentRange.toInput)}`
    : currentRange.label;

  return (
    <div ref={popoverRef} className={`relative inline-flex items-center gap-1.5 ${className}`}>
      {/* Segmented Preset Bar */}
      <div className="segmented">
        {RANGE_PRESETS.map((p) => {
          const active = currentRange.key === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPresetKey(p.key)}
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

        {/* Custom Calendar Trigger Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-pressed={isCustomActive || isOpen}
          aria-expanded={isOpen}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            isCustomActive || isOpen
              ? "bg-[#0284C7]/10 dark:bg-[#38BDF8]/15 text-[#0284C7] dark:text-[#38BDF8] font-semibold border border-[#0284C7]/30"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
          title="Open Custom Calendar"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {isCustomActive ? displayLabel : "Custom Calendar"}
          </span>
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Themed Custom Calendar Popover */}
      {isOpen && (
        <div data-lenis-prevent className="absolute right-0 top-full mt-2.5 z-50 p-4 rounded-2xl backdrop-blur-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-white/10 shadow-2xl w-[320px] sm:w-[460px] animate-in fade-in zoom-in-95 duration-150">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Quick Presets Column */}
            <div data-lenis-prevent className="sm:w-36 shrink-0 flex flex-row sm:flex-col gap-1 border-b sm:border-b-0 sm:border-r border-slate-200/70 dark:border-white/10 pb-3 sm:pb-0 sm:pr-3 overflow-x-auto sm:overflow-visible">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 hidden sm:block">
                Quick Select
              </span>
              <button
                type="button"
                onClick={() => setQuickRange("today")}
                className="text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setQuickRange("yesterday")}
                className="text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setQuickRange("last7")}
                className="text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => setQuickRange("last30")}
                className="text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => setQuickRange("thisMonth")}
                className="text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setQuickRange("lastMonth")}
                className="text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Last Month
              </button>
            </div>

            {/* Calendar Main Grid */}
            <div className="flex-1">
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                    aria-label="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setViewYear(now.getFullYear());
                      setViewMonth(now.getMonth());
                    }}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                    title="Jump to current month"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {(() => {
                    const now = new Date();
                    const isNextDisabled =
                      viewYear > now.getFullYear() ||
                      (viewYear === now.getFullYear() && viewMonth >= now.getMonth());
                    return (
                      <button
                        type="button"
                        onClick={nextMonth}
                        disabled={isNextDisabled}
                        className={`p-1 rounded-lg transition-colors ${
                          isNextDisabled
                            ? "opacity-30 cursor-not-allowed text-slate-300 dark:text-slate-600"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                        aria-label="Next Month"
                        title={isNextDisabled ? "Future months are disabled" : "Next Month"}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* Weekday Row */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="text-[10.5px] font-semibold text-slate-400 dark:text-slate-500 py-1"
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* Day Cells Grid */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {allCells.map(({ day, dateStr, isCurrentMonth }, idx) => {
                  const todayStr = toIsoDate(new Date());
                  const isFuture = dateStr > todayStr;
                  const isStart = startDate === dateStr;
                  const isEnd = endDate === dateStr;
                  const hasBoth = Boolean(startDate && endDate);

                  // Range in-between highlighting
                  let inRange = false;
                  if (!isFuture) {
                    if (hasBoth) {
                      const min = startDate < endDate ? startDate : endDate;
                      const max = startDate < endDate ? endDate : startDate;
                      inRange = dateStr > min && dateStr < max;
                    } else if (startDate && hoverDate && !endDate) {
                      const min = startDate < hoverDate ? startDate : hoverDate;
                      const max = startDate < hoverDate ? hoverDate : startDate;
                      inRange = dateStr > min && dateStr < max;
                    }
                  }

                  const isHoverEnd = !isFuture && !endDate && hoverDate === dateStr;
                  const isToday = dateStr === todayStr;

                  return (
                    <button
                      key={`${dateStr}-${idx}`}
                      type="button"
                      disabled={isFuture}
                      onClick={() => !isFuture && handleDateClick(dateStr)}
                      onMouseEnter={() => {
                        if (startDate && !endDate && !isFuture) setHoverDate(dateStr);
                      }}
                      className={`
                        h-7 text-xs rounded-md transition-colors relative flex items-center justify-center font-medium
                        ${
                          isFuture
                            ? "opacity-25 cursor-not-allowed pointer-events-none text-slate-300 dark:text-slate-600"
                            : !isCurrentMonth
                            ? "text-slate-300 dark:text-slate-600"
                            : "text-slate-800 dark:text-slate-200"
                        }
                        ${
                          !isFuture && (isStart || isEnd || isHoverEnd)
                            ? "bg-[#0284C7] text-white font-bold shadow-xs hover:bg-[#0284C7]"
                            : !isFuture && inRange
                            ? "bg-[#0284C7]/15 dark:bg-[#38BDF8]/20 text-[#0284C7] dark:text-[#38BDF8]"
                            : !isFuture
                            ? "hover:bg-slate-100 dark:hover:bg-slate-800"
                            : ""
                        }
                        ${isToday && !isStart && !isEnd ? "underline underline-offset-2 decoration-[#0284C7]" : ""}
                      `}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected Range Display & Action Footer */}
          <div className="mt-4 pt-3 border-t border-slate-200/70 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11.5px] text-slate-600 dark:text-slate-400 text-center sm:text-left">
              {startDate ? (
                <span>
                  <strong className="text-slate-900 dark:text-white font-semibold">
                    {toDisplayDate(startDate)}
                  </strong>{" "}
                  {endDate ? (
                    <>
                      &rarr;{" "}
                      <strong className="text-slate-900 dark:text-white font-semibold">
                        {toDisplayDate(endDate)}
                      </strong>
                    </>
                  ) : (
                    <span className="italic text-slate-400"> (select end date)</span>
                  )}
                </span>
              ) : (
                <span className="italic text-slate-400">Click a date to begin selection</span>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn btn-ghost btn-sm text-xs h-7 px-2.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => applyCustomRange(startDate, endDate || startDate)}
                disabled={!startDate}
                className="btn btn-primary btn-sm text-xs h-7 px-3 bg-[#0284C7] hover:bg-[#0369a1] text-white disabled:opacity-50"
              >
                Apply Range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
