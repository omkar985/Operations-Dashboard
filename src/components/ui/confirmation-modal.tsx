"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
}: ConfirmationModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="scrim flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="panel max-w-md w-full p-6 shadow-pop animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-3">
          {variant === "danger" ? (
            <div className="flex-none p-2 rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="flex-none p-2 rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <AlertTriangle className="w-5 h-5" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 id="modal-title" className="text-base font-semibold text-[var(--ink)]">
              {title}
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
              {description}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon -mr-2 -mt-2 text-[var(--muted)] hover:text-[var(--ink)]"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${
              variant === "danger" ? "btn-danger-solid" : "btn-primary"
            }`}
            onClick={async () => {
              await onConfirm();
            }}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
