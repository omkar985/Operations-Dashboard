import React from "react";

interface StatusBadgeProps {
  status?: string | null | undefined;
  priority?: string | null | undefined;
  variant?: "auto" | "success" | "warning" | "error" | "info" | "neutral" | "brand";
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({
  status,
  priority,
  variant = "auto",
  size = "md",
  className = "",
}: StatusBadgeProps) {
  const label = priority ?? status;
  if (!label) {
    return <span className="text-[var(--muted)] text-xs">—</span>;
  }

  const s = label.toLowerCase();
  let v = variant;

  if (v === "auto") {
    if (s.includes("closed") || s.includes("resolved") || s.includes("completed") || s.includes("done") || s.includes("success") || s.includes("active")) {
      v = "success";
    } else if (s.includes("overdue") || s.includes("critical") || s.includes("urgent") || s.includes("high") || s.includes("failed") || s.includes("error") || s.includes("blocked")) {
      v = "error";
    } else if (s.includes("pending") || s.includes("waiting") || s.includes("warning") || s.includes("hold") || s.includes("medium")) {
      v = "warning";
    } else if (s.includes("open") || s.includes("in progress") || s.includes("investigating") || s.includes("working")) {
      v = "brand";
    } else if (s.includes("info") || s.includes("assigned") || s.includes("low")) {
      v = "info";
    } else {
      v = "neutral";
    }
  }

  const variantClass =
    v === "success"
      ? "badge-success"
      : v === "warning"
      ? "badge-warning"
      : v === "error"
      ? "badge-error"
      : v === "info"
      ? "badge-info"
      : v === "brand"
      ? "badge-brand"
      : "badge-neutral";

  const sizeClass = size === "sm" ? "text-[11px] h-5 px-1.5" : "text-[12px] h-[22px] px-2";

  return (
    <span className={`badge ${variantClass} ${sizeClass} font-medium inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      {label}
    </span>
  );
}
