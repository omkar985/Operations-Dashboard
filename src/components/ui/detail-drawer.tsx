"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, Clock, User, Tag, Layers, AlertCircle, FileSpreadsheet } from "lucide-react";
import type { OpsRecord } from "@/types/operations";
import { StatusBadge } from "./status-badge";

interface DetailDrawerProps {
  record: OpsRecord | null;
  onClose: () => void;
  open: boolean;
}

export function DetailDrawer({ record, onClose, open }: DetailDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return (
      d.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }) + " UTC"
    );
  };

  return (
    <AnimatePresence>
      {open && record && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="scrim z-50"
          />

          {/* Drawer panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[var(--card)] border-l border-[var(--line)] shadow-pop flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-[var(--line-subtle)]">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="eyebrow flex items-center gap-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Sheet Row #{record.row}
                  </span>
                  {record.status && <StatusBadge status={record.status} size="sm" />}
                  {record.priority && <StatusBadge status={record.priority} variant="warning" size="sm" />}
                </div>
                <h2 id="drawer-title" className="text-base font-bold text-[var(--ink)] leading-snug">
                  {record.title || (record.id ? `Record #${record.id}` : "Operational Record")}
                </h2>
                {record.id && record.title && (
                  <p className="text-xs text-[var(--muted)] mono mt-0.5">ID: {record.id}</p>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost btn-sm btn-icon text-[var(--muted)] hover:text-[var(--ink)] -mr-2"
                aria-label="Close details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable details */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Properties Grid */}
              <div className="space-y-3">
                <h3 className="eyebrow">Attributes</h3>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded bg-[var(--raised)] border border-[var(--line-subtle)]">
                    <dt className="text-[var(--muted)] flex items-center gap-1.5 mb-1">
                      <Tag className="w-3.5 h-3.5" />
                      Category
                    </dt>
                    <dd className="font-semibold text-[var(--ink)] truncate">
                      {record.category || "—"}
                    </dd>
                  </div>

                  <div className="p-2.5 rounded bg-[var(--raised)] border border-[var(--line-subtle)]">
                    <dt className="text-[var(--muted)] flex items-center gap-1.5 mb-1">
                      <Layers className="w-3.5 h-3.5" />
                      Team
                    </dt>
                    <dd className="font-semibold text-[var(--ink)] truncate">
                      {record.team || "—"}
                    </dd>
                  </div>

                  <div className="col-span-2 p-2.5 rounded bg-[var(--raised)] border border-[var(--line-subtle)]">
                    <dt className="text-[var(--muted)] flex items-center gap-1.5 mb-1">
                      <User className="w-3.5 h-3.5" />
                      Assignee
                    </dt>
                    <dd className="font-semibold text-[var(--ink)]">
                      {record.assignee || "Unassigned"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                <h3 className="eyebrow">Timeline & SLA</h3>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded border border-[var(--line-subtle)] bg-[var(--card)]">
                    <div className="flex items-center gap-2 text-[var(--muted)]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Created</span>
                    </div>
                    <span className="font-medium text-[var(--ink)] tnum">
                      {formatDate(record.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded border border-[var(--line-subtle)] bg-[var(--card)]">
                    <div className="flex items-center gap-2 text-[var(--muted)]">
                      <AlertCircle className="w-3.5 h-3.5 text-[var(--warning)]" />
                      <span>Due date</span>
                    </div>
                    <span className="font-medium text-[var(--ink)] tnum">
                      {formatDate(record.dueAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded border border-[var(--line-subtle)] bg-[var(--card)]">
                    <div className="flex items-center gap-2 text-[var(--muted)]">
                      <Calendar className="w-3.5 h-3.5 text-[var(--success)]" />
                      <span>Resolved</span>
                    </div>
                    <span className="font-medium text-[var(--ink)] tnum">
                      {formatDate(record.resolvedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--line-subtle)] bg-[var(--raised)] flex items-center justify-end">
              <button type="button" onClick={onClose} className="btn btn-sm">
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
