"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, Save, FileSpreadsheet } from "lucide-react";
import {
  FIELD_KEYS,
  FIELD_META,
  type FieldKey,
  type SheetMapping,
  type DateFormat,
} from "@/types/operations";
import type { SourceInspection } from "@/server/services/source-inspector";
import { useToast } from "@/components/providers/toast-provider";
import { idempotentFetch } from "@/lib/http/idempotent-fetch";

interface SourceMappingEditorProps {
  initialMapping: SheetMapping | null;
  initialInspection: SourceInspection | null;
}

export function SourceMappingEditor({
  initialMapping,
  initialInspection,
}: SourceMappingEditorProps) {
  const router = useRouter();
  const toast = useToast();

  const [inspection, setInspection] = useState<SourceInspection | null>(initialInspection);
  const [worksheet, setWorksheet] = useState<string>(
    initialMapping?.worksheet || initialInspection?.worksheets[0]?.title || ""
  );
  const [headerRow, setHeaderRow] = useState<number>(initialMapping?.headerRow ?? 1);
  const [dateFormat, setDateFormat] = useState<DateFormat>(initialMapping?.dateFormat ?? "DMY");
  const [columns, setColumns] = useState<Partial<Record<FieldKey, string>>>(
    initialMapping?.columns ?? {}
  );
  const [completedStatusesText, setCompletedStatusesText] = useState<string>(
    (initialMapping?.completedStatuses ?? ["Resolved", "Closed", "Done", "Completed"]).join(", ")
  );

  const [isInspecting, setIsInspecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleInspect(wsName = worksheet, hRow = headerRow) {
    setIsInspecting(true);
    try {
      const res = await fetch(
        `/api/admin/sheets/inspect?worksheet=${encodeURIComponent(wsName)}&headerRow=${hRow}`
      );
      const body = await res.json().catch(() => ({}));

      if (res.ok && body.data?.inspection) {
        setInspection(body.data.inspection);
        toast.success("Sheet Inspected", `Found ${body.data.inspection.headers?.length ?? 0} columns in "${wsName}".`);
      } else {
        toast.error("Inspection Failed", body.error?.message || "Failed to inspect Google Sheet.");
      }
    } catch {
      toast.error("Network Error", "Unable to contact inspection service.");
    } finally {
      setIsInspecting(false);
    }
  }

  function applySuggestions() {
    if (!inspection?.suggestions) return;
    setColumns((prev) => ({
      ...prev,
      ...inspection.suggestions,
    }));
    toast.info("Auto-mapped Columns", "Applied heuristic column suggestions from header names.");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    if (!worksheet) {
      toast.error("Validation Error", "Please select a worksheet.");
      return;
    }

    const completedStatuses = completedStatusesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const mappingPayload: SheetMapping = {
      worksheet,
      headerRow,
      dateFormat,
      columns,
      completedStatuses,
    };

    setIsSaving(true);
    try {
      const res = await idempotentFetch("/api/admin/settings/mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mappingPayload),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Mapping Saved", "Column mapping updated. Background synchronization triggered.");
        router.refresh();
      } else {
        toast.error("Save Failed", body.error?.message || "Failed to save mapping.");
      }
    } catch {
      toast.error("Network Error", "Unable to save column mapping.");
    } finally {
      setIsSaving(false);
    }
  }

  const availableHeaders = inspection?.headers ?? [];

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      {/* 1. Worksheet & Header Row Configuration */}
      <section className="panel p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileSpreadsheet className="w-5 h-5 text-[var(--primary)]" />
          <h2 className="panel-title">Source Spreadsheet Configuration</h2>
        </div>
        <p className="panel-sub mb-4">
          Select the target tab and header row index for the operational dataset.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="field">
            <label className="label" htmlFor="source-worksheet">
              Worksheet (Tab)
            </label>
            <select
              id="source-worksheet"
              value={worksheet}
              onChange={(e) => {
                setWorksheet(e.target.value);
                handleInspect(e.target.value, headerRow);
              }}
              className="select"
            >
              {inspection?.worksheets && inspection.worksheets.length > 0 ? (
                inspection.worksheets.map((w) => (
                  <option key={w.title} value={w.title}>
                    {w.title} ({w.rowCount.toLocaleString()} rows)
                  </option>
                ))
              ) : (
                <option value={worksheet || ""}>{worksheet || "Select worksheet"}</option>
              )}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor="header-row">
              Header Row
            </label>
            <input
              id="header-row"
              type="number"
              min={1}
              max={200}
              value={headerRow}
              onChange={(e) => setHeaderRow(parseInt(e.target.value, 10) || 1)}
              className="input"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="date-format-fallback">
              Date Text Parsing Fallback
            </label>
            <select
              id="date-format-fallback"
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as DateFormat)}
              className="select"
            >
              <option value="DMY">Day / Month / Year (DD/MM/YYYY)</option>
              <option value="MDY">Month / Day / Year (MM/DD/YYYY)</option>
              <option value="ISO">ISO Standard (YYYY-MM-DD)</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className="btn btn-sm btn-ghost gap-1.5 text-xs text-[var(--primary-ink)]"
            onClick={() => handleInspect(worksheet, headerRow)}
            disabled={isInspecting}
          >
            <Search className={`w-3.5 h-3.5 ${isInspecting ? "spin" : ""}`} />
            <span>{isInspecting ? "Reading Sheet..." : "Re-inspect Live Headers"}</span>
          </button>

          {inspection?.suggestions && Object.keys(inspection.suggestions).length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-ghost gap-1.5 text-xs text-amber-600 dark:text-amber-400"
              onClick={applySuggestions}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Fill Suggested Columns</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. Column Mapping Matrix */}
      <section className="panel overflow-hidden">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Column Mapping Matrix</h2>
            <p className="panel-sub">
              Map standard operational keys to column headers discovered in your spreadsheet.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="min-w-[240px]">Canonical Target</th>
                <th className="w-32">Kind</th>
                <th className="min-w-[260px]">Spreadsheet Column Header</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_KEYS.map((key) => {
                const meta = FIELD_META[key];
                const currentMapped = columns[key] ?? "";

                return (
                  <tr key={key}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs text-[var(--ink)]">
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-[var(--muted)]">
                          {meta.description}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className="badge badge-brand text-[10px]">
                        {meta.kind}
                      </span>
                    </td>

                    <td className="w-72">
                      <select
                        value={currentMapped}
                        onChange={(e) => {
                          const val = e.target.value;
                          setColumns((prev) => {
                            const next = { ...prev };
                            if (val) next[key] = val;
                            else delete next[key];
                            return next;
                          });
                        }}
                        className="select !h-8 !text-xs rounded-lg w-full"
                      >
                        <option value="">(Unmapped)</option>
                        {availableHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Completed Status Values */}
      <section className="panel p-6">
        <h2 className="panel-title mb-1">Completed Status Values</h2>
        <p className="panel-sub mb-3">
          Comma-separated list of workflow states considered complete (e.g., Resolved, Closed, Done, Fixed).
        </p>
        <div className="field max-w-lg">
          <input
            type="text"
            value={completedStatusesText}
            onChange={(e) => setCompletedStatusesText(e.target.value)}
            className="input"
            placeholder="Resolved, Closed, Completed, Done"
          />
        </div>
      </section>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSaving}
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? "Saving &amp; Syncing..." : "Save Mapping &amp; Trigger Sync"}</span>
        </button>
      </div>
    </form>
  );
}
