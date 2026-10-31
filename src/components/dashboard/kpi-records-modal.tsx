"use client";

// High-value order records modal with smooth scrolling
import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  X,
  Search,
  ExternalLink,
  Copy,
  Check,
  Download,
  Package,
  Clock,
  Truck,
  Layers,
  ArrowUpDown,
} from "lucide-react";
import type { OpsRecord } from "@/types/operations";
import type { KpiKey, DateRange } from "@/lib/metrics/compute";
import {
  getRecordCol,
  getRecordStatus,
  parseSheetDate,
  serialToIso,
} from "@/lib/google-sheets/mapping";
import {
  getRecordOrderDate,
  getRecordAmount,
  isNotYetProcessed,
  isNotYetDelivered,
  isMonthlyReceived,
} from "@/lib/metrics/compute";

interface KpiRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpiKey: KpiKey | null;
  kpiTitle: string;
  records: OpsRecord[];
  range: DateRange;
}

// Format date helper: returns "24 Oct 2026"
function formatDateDisplay(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Parse EDD column (might be a serial date like 46064 or string date)
function parseEdd(raw: string | null): string {
  if (!raw || !raw.trim()) return "—";
  const trimmed = raw.trim();
  // Check if serial number
  if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) {
    const iso = serialToIso(Number(trimmed));
    if (iso) return formatDateDisplay(new Date(iso));
  }
  const iso = parseSheetDate(trimmed, "ISO") ?? parseSheetDate(trimmed, "DMY");
  if (iso) return formatDateDisplay(new Date(iso));
  return trimmed;
}

// Normalize courier name for badges
function normalizeCourier(str: string): string {
  const s = str.trim().toLowerCase();
  if (s.includes("bluedart") || s.includes("blue dart")) return "Blue Dart";
  if (s.includes("delhivery")) return "Delhivery";
  if (s.includes("dtdc")) return "DTDC";
  if (s.includes("xpress") || s.includes("xpressbees")) return "Xpressbees";
  if (s.includes("fedex")) return "FedEx";
  if (s.includes("ecom")) return "Ecom Express";
  if (s.includes("shadowfax")) return "Shadowfax";
  return str.trim();
}

// Extract tracking ID & courier from Action taken or Tracking column
function extractTrackingInfo(raw: string | null): {
  courier: string | null;
  trackingId: string | null;
  rawText: string;
} {
  if (!raw || !raw.trim()) {
    return { courier: null, trackingId: null, rawText: "" };
  }
  const text = raw.trim();
  // Pattern: "bluedart - 90717928836" or "dtdc : 123456"
  const m = text.match(/^([a-zA-Z\s]+)\s*[-:]\s*([a-zA-Z0-9_-]+)$/);
  if (m) {
    return {
      courier: normalizeCourier(m[1]),
      trackingId: m[2].trim(),
      rawText: text,
    };
  }
  // Pure alphanumeric tracking code
  if (/^[A-Za-z0-9]{8,}$/.test(text)) {
    return { courier: null, trackingId: text, rawText: text };
  }
  return { courier: null, trackingId: text, rawText: text };
}

export function KpiRecordsModal({
  isOpen,
  onClose,
  kpiKey,
  kpiTitle,
  records,
  range,
}: KpiRecordsModalProps) {
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"date" | "amount" | "order">("date");
  const [sortAsc, setSortAsc] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press & prevent background scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Filter records based on selected KPI key
  const cohortRecords = useMemo(() => {
    if (!kpiKey) return records;
    if (kpiKey === "not_yet_processed") {
      return records.filter(isNotYetProcessed);
    }
    if (kpiKey === "not_yet_delivered") {
      return records.filter(isNotYetDelivered);
    }
    if (kpiKey === "monthly_received") {
      return records.filter((r) => isMonthlyReceived(r, range));
    }
    return records;
  }, [kpiKey, records, range]);

  // Search filter & sort
  const filteredRecords = useMemo(() => {
    let result = cohortRecords;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((r) => {
        const orderNo = (getRecordCol(r, "Order No") ?? r.id ?? "").toLowerCase();
        const sku = (getRecordCol(r, "SKU") ?? "").toLowerCase();
        const customer = (getRecordCol(r, "Name") ?? r.title ?? "").toLowerCase();
        const status = getRecordStatus(r).toLowerCase();
        const action = (getRecordCol(r, "Action taken") ?? "").toLowerCase();
        return (
          orderNo.includes(q) ||
          sku.includes(q) ||
          customer.includes(q) ||
          status.includes(q) ||
          action.includes(q)
        );
      });
    }

    return [...result].sort((a, b) => {
      if (sortField === "amount") {
        const amtA = getRecordAmount(a) ?? 0;
        const amtB = getRecordAmount(b) ?? 0;
        return sortAsc ? amtA - amtB : amtB - amtA;
      }
      if (sortField === "order") {
        const idA = getRecordCol(a, "without #") ?? getRecordCol(a, "Order No") ?? a.id ?? "";
        const idB = getRecordCol(b, "without #") ?? getRecordCol(b, "Order No") ?? b.id ?? "";
        return sortAsc ? idA.localeCompare(idB) : idB.localeCompare(idA);
      }
      // Default: date descending
      const dateA = getRecordOrderDate(a)?.getTime() ?? 0;
      const dateB = getRecordOrderDate(b)?.getTime() ?? 0;
      return sortAsc ? dateA - dateB : dateB - dateA;
    });
  }, [cohortRecords, search, sortField, sortAsc]);

  // Aggregate stats
  const totalAmount = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + (getRecordAmount(r) ?? 0), 0);
  }, [filteredRecords]);

  // Copy tracking ID handler
  const handleCopy = (trackingId: string) => {
    navigator.clipboard.writeText(trackingId);
    setCopiedId(trackingId);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Export current table view to CSV
  const handleExportCsv = () => {
    const headers = [
      "Order Number",
      "Order Date",
      "Customer Name",
      "Amount (INR)",
      "SKU",
      "Tracking ID",
      "Courier",
      "Latest Tracking Status",
      "EDD",
      "Dispatched",
      "Shopify Admin URL",
    ];

    const rows = filteredRecords.map((r) => {
      const orderNo = getRecordCol(r, "Order No") ?? r.id ?? "";
      const cleanId = (getRecordCol(r, "without #") ?? orderNo).replace(/^#/, "").trim();
      const orderDate = formatDateDisplay(getRecordOrderDate(r));
      const customer = getRecordCol(r, "Name") ?? r.title ?? "";
      const amt = getRecordAmount(r) ?? 0;
      const sku = getRecordCol(r, "SKU") ?? "";
      const track = extractTrackingInfo(getRecordCol(r, "Action taken"));
      const status = getRecordStatus(r);
      const edd = parseEdd(getRecordCol(r, "EDD"));
      const dispatched = getRecordCol(r, "Dispatched ") ?? getRecordCol(r, "Dispatched") ?? "No";
      const shopifyUrl = `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(cleanId)}`;

      return [
        `"${orderNo.replace(/"/g, '""')}"`,
        `"${orderDate}"`,
        `"${customer.replace(/"/g, '""')}"`,
        amt,
        `"${sku.replace(/"/g, '""')}"`,
        `"${(track.trackingId ?? "").replace(/"/g, '""')}"`,
        `"${(track.courier ?? "").replace(/"/g, '""')}"`,
        `"${status.replace(/"/g, '""')}"`,
        `"${edd}"`,
        `"${dispatched}"`,
        `"${shopifyUrl}"`,
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kpiTitle.toLowerCase().replace(/\s+/g, "-")}-orders.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Forward wheel / touchpad events to scrollable table if cursor is over header or search bar
  const handleDialogWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const container = tableScrollRef.current;
    if (!container) return;
    if (!container.contains(e.target as Node)) {
      container.scrollTop += e.deltaY;
      container.scrollLeft += e.deltaX;
    }
  };

  if (!isOpen) return null;

  // Icon corresponding to current cohort
  const HeaderIcon =
    kpiKey === "not_yet_processed"
      ? Clock
      : kpiKey === "not_yet_delivered"
      ? Truck
      : Layers;

  const headerTheme =
    kpiKey === "not_yet_processed"
      ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
      : kpiKey === "not_yet_delivered"
      ? "text-indigo-500 bg-indigo-500/10 border-indigo-500/20"
      : "text-[#0284C7] bg-[#0284C7]/10 border-[#0284C7]/20";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onWheel={handleDialogWheel}
        className="relative w-full max-w-6xl h-[88vh] max-h-[900px] min-h-[440px] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Modal Top Header */}
        <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:px-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${headerTheme}`}
            >
              <HeaderIcon className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  {kpiTitle}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-950/60 text-[#0284C7] dark:text-[#38BDF8] border border-sky-200 dark:border-sky-800/50">
                  {filteredRecords.length}{" "}
                  {filteredRecords.length === 1 ? "Order" : "Orders"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Above ₹50,000 High-Value Orders &bull; Direct Google Sheet records &bull; Click order # to view in Shopify
              </p>
            </div>
          </div>

          {/* Action Header controls */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {totalAmount > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                <span className="text-emerald-600 dark:text-emerald-400">Total Value:</span>
                <span>₹{totalAmount.toLocaleString("en-IN")}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Download CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="shrink-0 p-3 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order #, SKU, customer, courier, status..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0284C7]/30 focus:border-[#0284C7]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Sort:</span>
            <button
              type="button"
              onClick={() => {
                if (sortField === "date") setSortAsc(!sortAsc);
                else {
                  setSortField("date");
                  setSortAsc(false);
                }
              }}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                sortField === "date"
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              Date {sortField === "date" && (sortAsc ? "↑" : "↓")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (sortField === "amount") setSortAsc(!sortAsc);
                else {
                  setSortField("amount");
                  setSortAsc(false);
                }
              }}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                sortField === "amount"
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              Amount {sortField === "amount" && (sortAsc ? "↑" : "↓")}
            </button>
          </div>
        </div>

        {/* Scrollable Table View */}
        <div
          ref={tableScrollRef}
          tabIndex={0}
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-auto overscroll-contain focus:outline-none"
          style={{
            touchAction: "pan-y pan-x",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <Package className="w-10 h-10 mb-2 stroke-1 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No orders match your filter
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Try refining your search query or switching date range presets.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse min-w-[760px]">
              <thead className="sticky top-0 z-10 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[10.5px]">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">Order Number</th>
                  <th className="py-2.5 px-3 sm:px-4">Order Date</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Amount</th>
                  <th className="py-2.5 px-3 sm:px-4">SKU / Product</th>
                  <th className="py-2.5 px-3 sm:px-4">Tracking ID</th>
                  <th className="py-2.5 px-3 sm:px-4">Latest Tracking Status</th>
                  <th className="py-2.5 px-3 sm:px-4">EDD</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Dispatched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredRecords.map((r, i) => {
                  const orderNo = getRecordCol(r, "Order No") ?? r.id ?? `Row ${r.row}`;
                  const cleanOrderId = (getRecordCol(r, "without #") ?? orderNo)
                    .replace(/^#/, "")
                    .trim();
                  const shopifyUrl = `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(
                    cleanOrderId
                  )}`;

                  const orderDate = formatDateDisplay(getRecordOrderDate(r));
                  const amt = getRecordAmount(r);
                  const sku = getRecordCol(r, "SKU") ?? "—";
                  const tracking = extractTrackingInfo(getRecordCol(r, "Action taken"));
                  const status = getRecordStatus(r) || "Pending Action";
                  const edd = parseEdd(getRecordCol(r, "EDD"));
                  const dispatchedRaw = (
                    getRecordCol(r, "Dispatched ") ??
                    getRecordCol(r, "Dispatched") ??
                    ""
                  ).trim().toLowerCase();
                  const isDispatched = dispatchedRaw === "yes";

                  // Status badge styling
                  let statusBadgeClass =
                    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
                  const lowerStatus = status.toLowerCase();
                  if (lowerStatus.includes("deliver")) {
                    statusBadgeClass =
                      "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40";
                  } else if (
                    lowerStatus.includes("connected") ||
                    lowerStatus.includes("hub") ||
                    lowerStatus.includes("transit") ||
                    lowerStatus.includes("arrived")
                  ) {
                    statusBadgeClass =
                      "bg-sky-50 dark:bg-sky-950/50 text-[#0284C7] dark:text-[#38BDF8] border-sky-200 dark:border-sky-800/40";
                  } else if (
                    lowerStatus.includes("cancel") ||
                    lowerStatus.includes("rto") ||
                    lowerStatus.includes("return")
                  ) {
                    statusBadgeClass =
                      "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40";
                  } else if (
                    lowerStatus.includes("not mapped") ||
                    lowerStatus.includes("redirect") ||
                    lowerStatus.includes("pending")
                  ) {
                    statusBadgeClass =
                      "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40";
                  }

                  return (
                    <tr
                      key={r.id || `row-${r.row}-${i}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. Order Number (Clickable to Shopify) */}
                      <td className="py-2.5 px-3 sm:px-4 font-mono font-medium whitespace-nowrap">
                        <a
                          href={shopifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#0284C7] dark:text-[#38BDF8] hover:underline font-semibold"
                          title="Open Order in Shopify Admin"
                        >
                          <span>{orderNo.startsWith("#") ? orderNo : `#${orderNo}`}</span>
                          <ExternalLink className="w-3 h-3 opacity-70" />
                        </a>
                      </td>

                      {/* 2. Order Date */}
                      <td className="py-2.5 px-3 sm:px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {orderDate}
                      </td>

                      {/* 3. Amount */}
                      <td className="py-2.5 px-3 sm:px-4 text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {amt !== null ? `₹${amt.toLocaleString("en-IN")}` : "—"}
                      </td>

                      {/* 4. SKU */}
                      <td className="py-2.5 px-3 sm:px-4 max-w-[240px]">
                        <span
                          className="line-clamp-2 text-slate-700 dark:text-slate-300 font-sans"
                          title={sku}
                        >
                          {sku}
                        </span>
                      </td>

                      {/* 5. Tracking ID */}
                      <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                        {tracking.trackingId ? (
                          <div className="inline-flex items-center gap-1.5">
                            {tracking.courier && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
                                {tracking.courier}
                              </span>
                            )}
                            <span className="font-mono text-slate-800 dark:text-slate-200">
                              {tracking.trackingId}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(tracking.trackingId!)}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                              title="Copy Tracking ID"
                            >
                              {copiedId === tracking.trackingId ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic text-[11px]">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* 6. Latest Tracking Status */}
                      <td className="py-2.5 px-3 sm:px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadgeClass} whitespace-nowrap`}
                          title={status}
                        >
                          {status}
                        </span>
                      </td>

                      {/* 7. EDD */}
                      <td className="py-2.5 px-3 sm:px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap font-mono text-[11.5px]">
                        {edd}
                      </td>

                      {/* 8. Dispatched */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        {isDispatched ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                            Dispatched
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer Info */}
        <div className="shrink-0 p-3 sm:px-6 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {filteredRecords.length} of {cohortRecords.length} records
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
