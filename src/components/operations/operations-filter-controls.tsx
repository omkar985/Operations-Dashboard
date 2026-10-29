"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar, type ActiveFilters, type FilterOptions } from "@/components/ui/filter-bar";

interface OperationsFilterControlsProps {
  options: FilterOptions;
  active: ActiveFilters;
}

export function OperationsFilterControls({
  options,
  active,
}: OperationsFilterControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleFilterChange(updated: ActiveFilters) {
    const next = new URLSearchParams(searchParams?.toString() || "");

    // Status
    if (updated.status) next.set("status", updated.status);
    else next.delete("status");

    // Priority
    if (updated.priority) next.set("priority", updated.priority);
    else next.delete("priority");

    // Team
    if (updated.team) next.set("team", updated.team);
    else next.delete("team");

    // Category
    if (updated.category) next.set("category", updated.category);
    else next.delete("category");

    // SLA Breached
    if (updated.slaBreached) next.set("slaBreached", "true");
    else next.delete("slaBreached");

    // Reset pagination to first page
    next.set("page", "1");

    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="w-full sm:max-w-md">
          <SearchInput placeholder="Search records by ID, title, team, assignee..." />
        </div>
      </div>

      <FilterBar
        options={options}
        active={active}
        onChange={handleFilterChange}
      />
    </div>
  );
}
