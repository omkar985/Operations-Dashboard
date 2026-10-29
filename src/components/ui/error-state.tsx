import { type ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message: string;
  code?: string;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = "An unexpected error occurred",
  message,
  code,
  onRetry,
  action,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`panel flex flex-col items-center justify-center p-10 text-center border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10 ${className}`}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 mb-3">
        <AlertCircle className="w-6 h-6 stroke-[1.75]" />
      </div>
      <h3 className="text-base font-semibold text-[var(--ink)] tracking-tight">
        {title}
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)] max-w-md leading-relaxed">
        {message}
      </p>
      {code && (
        <code className="mt-2 px-2 py-0.5 rounded text-xs font-mono bg-red-100/80 dark:bg-red-950/60 text-red-700 dark:text-red-300">
          Ref: {code}
        </code>
      )}
      <div className="mt-5 flex items-center gap-3">
        {onRetry && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onRetry}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Try Again
          </button>
        )}
        {action}
      </div>
    </div>
  );
}
