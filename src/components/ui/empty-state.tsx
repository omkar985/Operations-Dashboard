import { type ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`panel flex flex-col items-center justify-center p-12 text-center ${className}`}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--raised)] border border-[var(--line-subtle)] text-[var(--muted)] mb-4">
        {icon ?? <Inbox className="w-6 h-6 stroke-[1.5]" />}
      </div>
      <h3 className="text-base font-semibold text-[var(--ink)] tracking-tight">
        {title}
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)] max-w-sm leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
