import React from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[var(--line-subtle)] ${className}`}>
      <div className="space-y-1">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title text-[var(--ink)]">{title}</h1>
        {description && (
          <p className="text-xs sm:text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{children}</div>}
    </header>
  );
}
