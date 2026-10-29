"use client";

import { useTransition } from "react";
import { Filter, X } from "lucide-react";

export interface FilterOptions {
  statuses: string[];
  priorities: string[];
  teams: string[];
  categories: string[];
}

export interface ActiveFilters {
  status?: string;
  priority?: string;
  team?: string;
  category?: string;
  slaBreached?: boolean;
}

interface FilterBarProps {
  options: FilterOptions;
  active: ActiveFilters;
  onChange: (updated: ActiveFilters) => void;
  className?: string;
}

export function FilterBar({
  options,
  active,
  onChange,
  className = "",
}: FilterBarProps) {
  const [, startTransition] = useTransition();

  const activeCount = Object.entries(active).filter(
    ([, v]) => v !== undefined && v !== "" && v !== false
  ).length;

  function updateFilter(key: keyof ActiveFilters, value: string | boolean | undefined) {
    startTransition(() => {
      const next = { ...active, [key]: value || undefined };
      if (value === "" || value === false || value === undefined) {
        delete next[key];
      }
      onChange(next);
    });
  }

  function clearAll() {
    startTransition(() => {
      onChange({});
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 py-1 ${className}`}
      role="region"
      aria-label="Filter records"
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-strong)] uppercase tracking-wider mr-1">
        <Filter className="w-3.5 h-3.5" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--primary)] text-white text-[10px] font-bold">
            {activeCount}
          </span>
        )}
      </div>

      {/* Status Filter */}
      {options.statuses.length > 0 && (
        <select
          className="select !h-8 !text-xs !py-0 !px-2.5 w-auto min-w-[120px] rounded-md"
          value={active.status || ""}
          onChange={(e) => updateFilter("status", e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">Status: All</option>
          {options.statuses.map((s) => (
            <option key={s} value={s}>
              Status: {s}
            </option>
          ))}
        </select>
      )}

      {/* Priority Filter */}
      {options.priorities.length > 0 && (
        <select
          className="select !h-8 !text-xs !py-0 !px-2.5 w-auto min-w-[120px] rounded-md"
          value={active.priority || ""}
          onChange={(e) => updateFilter("priority", e.target.value)}
          aria-label="Filter by priority"
        >
          <option value="">Priority: All</option>
          {options.priorities.map((p) => (
            <option key={p} value={p}>
              Priority: {p}
            </option>
          ))}
        </select>
      )}

      {/* Team Filter */}
      {options.teams.length > 0 && (
        <select
          className="select !h-8 !text-xs !py-0 !px-2.5 w-auto min-w-[120px] rounded-md"
          value={active.team || ""}
          onChange={(e) => updateFilter("team", e.target.value)}
          aria-label="Filter by team"
        >
          <option value="">Team: All</option>
          {options.teams.map((t) => (
            <option key={t} value={t}>
              Team: {t}
            </option>
          ))}
        </select>
      )}

      {/* Category Filter */}
      {options.categories.length > 0 && (
        <select
          className="select !h-8 !text-xs !py-0 !px-2.5 w-auto min-w-[130px] rounded-md"
          value={active.category || ""}
          onChange={(e) => updateFilter("category", e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">Category: All</option>
          {options.categories.map((c) => (
            <option key={c} value={c}>
              Category: {c}
            </option>
          ))}
        </select>
      )}

      {/* SLA Breached Toggle */}
      <button
        type="button"
        className={`btn btn-sm !h-8 !text-xs !px-3 rounded-md transition-colors ${
          active.slaBreached
            ? "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
            : "text-[var(--muted-strong)] hover:text-[var(--ink)]"
        }`}
        onClick={() => updateFilter("slaBreached", !active.slaBreached)}
        aria-pressed={Boolean(active.slaBreached)}
      >
        <span
          className={`w-2 h-2 rounded-full mr-1.5 ${
            active.slaBreached ? "bg-red-500 animate-pulse" : "bg-[var(--line)]"
          }`}
        />
        SLA Breached Only
      </button>

      {/* Clear All Button */}
      {activeCount > 0 && (
        <button
          type="button"
          className="btn btn-ghost btn-sm !h-8 !text-xs text-[var(--muted)] hover:text-[var(--ink)] gap-1 px-2"
          onClick={clearAll}
        >
          <X className="w-3.5 h-3.5" />
          Reset filters
        </button>
      )}
    </div>
  );
}
