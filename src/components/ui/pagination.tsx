"use client";

import React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  pageCount,
  className = "",
}: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (total === 0) return null;

  const goToPage = (p: number) => {
    if (p < 1 || p > pageCount || p === page) return;
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.set("page", String(p));
    router.push(`${pathname}?${next.toString()}`);
  };

  const changePageSize = (size: number) => {
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.set("pageSize", String(size));
    next.set("page", "1");
    router.push(`${pathname}?${next.toString()}`);
  };

  const startIdx = Math.min((page - 1) * pageSize + 1, total);
  const endIdx = Math.min(page * pageSize, total);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 py-3 px-4 border-t border-[var(--line-subtle)] text-xs text-[var(--muted)] ${className}`}>
      <div className="flex items-center gap-2">
        <span>Showing</span>
        <span className="font-semibold text-[var(--ink)] tnum">
          {startIdx}–{endIdx}
        </span>
        <span>of</span>
        <span className="font-semibold text-[var(--ink)] tnum">
          {total.toLocaleString()}
        </span>
        <span>records</span>

        <span className="text-[var(--line)] mx-1">|</span>

        <label className="flex items-center gap-1.5">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value))}
            className="select h-7 text-xs py-0 pl-2 pr-6 border-[var(--line-subtle)]"
          >
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => goToPage(1)}
          disabled={page <= 1}
          className="btn btn-ghost btn-sm btn-icon"
          title="First page"
          aria-label="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          className="btn btn-ghost btn-sm btn-icon"
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <span className="px-2 font-medium tnum">
          Page {page} of {pageCount}
        </span>

        <button
          type="button"
          onClick={() => goToPage(page + 1)}
          disabled={page >= pageCount}
          className="btn btn-ghost btn-sm btn-icon"
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => goToPage(pageCount)}
          disabled={page >= pageCount}
          className="btn btn-ghost btn-sm btn-icon"
          title="Last page"
          aria-label="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
