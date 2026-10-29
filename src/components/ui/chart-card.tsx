import React from "react";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  badge,
  actions,
  children,
  className = "",
}: ChartCardProps) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="panel-title">{title}</h2>
            {badge}
          </div>
          {subtitle && <p className="panel-sub">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
