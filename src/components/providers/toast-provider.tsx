"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, duration = 4000) => {
      const id = Math.random().toString(36).slice(2, 9);
      const item: ToastItem = { id, type, title, message, duration };
      setToasts((prev) => [...prev.slice(-4), item]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((title: string, message?: string) => showToast("success", title, message), [showToast]);
  const error = useCallback((title: string, message?: string) => showToast("error", title, message, 6000), [showToast]);
  const warning = useCallback((title: string, message?: string) => showToast("warning", title, message, 5000), [showToast]);
  const info = useCallback((title: string, message?: string) => showToast("info", title, message), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-lg bg-[var(--card)] text-[var(--ink)] border-[var(--line)] animate-in fade-in slide-in-from-bottom-2 duration-150"
            style={{
              borderLeftWidth: "4px",
              borderLeftColor:
                t.type === "success"
                  ? "var(--success)"
                  : t.type === "error"
                  ? "var(--error)"
                  : t.type === "warning"
                  ? "var(--warning)"
                  : "var(--primary)",
            }}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === "success" && <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />}
              {t.type === "error" && <AlertCircle className="w-4 h-4 text-[var(--error)]" />}
              {t.type === "warning" && <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />}
              {t.type === "info" && <Info className="w-4 h-4 text-[var(--primary)]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold leading-snug">{t.title}</div>
              {t.message && <div className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{t.message}</div>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-[var(--muted)] hover:text-[var(--ink)] p-0.5 rounded transition-colors"
              aria-label="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
