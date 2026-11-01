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
  Users,
  Palette,
  Sparkles,
  PackageCheck,
  ClipboardList,
  Wrench,
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
  isWaitingOnCustomer,
  isWaitingOnLogo,
  isWaitingOnEngraving,
  isPendingOnDispatch,
  isDemoOrderReceivedNotProcessed,
  isDemoProcessedNotDispatched,
  isDemoRecord,
  isVModaRecord,
  isKantoRecord,
  isKantoWaitingOnAssembly,
  isKantoWaitingOnProcess,
  isKantoDispatched,
  isUnboxedRecord,
  isUnboxedWaitingOnConfirmation,
  isUnboxedWaitingOnProcess,
  getUnboxedConfirmationDueDate,
  getKantoStatus,
  getKantoAssemblingDueDate,
  isKantoDueDateOverdue,
  isKantoDueDateWithin,
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
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "within">("all");
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
      return records.filter((r) => isNotYetProcessed(r, range));
    }
    if (kpiKey === "not_yet_delivered") {
      return records.filter((r) => isNotYetDelivered(r, range));
    }
    if (kpiKey === "monthly_received") {
      return records.filter((r) => isMonthlyReceived(r, range));
    }
    if (kpiKey === "vmoda_waiting_customer") {
      return records.filter(isWaitingOnCustomer);
    }
    if (kpiKey === "vmoda_waiting_logo") {
      return records.filter(isWaitingOnLogo);
    }
    if (kpiKey === "vmoda_waiting_engraving") {
      return records.filter(isWaitingOnEngraving);
    }
    if (kpiKey === "vmoda_pending_dispatch") {
      return records.filter(isPendingOnDispatch);
    }
    if (kpiKey === "demo_received_not_processed") {
      return records.filter(isDemoOrderReceivedNotProcessed);
    }
    if (kpiKey === "demo_processed_not_dispatched") {
      return records.filter(isDemoProcessedNotDispatched);
    }
    if (kpiKey === "kanto_waiting_assembly") {
      return records.filter(isKantoWaitingOnAssembly);
    }
    if (kpiKey === "kanto_waiting_process") {
      return records.filter(isKantoWaitingOnProcess);
    }
    if (kpiKey === "kanto_dispatched") {
      return records.filter(isKantoDispatched);
    }
    if (kpiKey === "unboxed_waiting_confirmation") {
      return records.filter((r) => isUnboxedWaitingOnConfirmation(r, range));
    }
    if (kpiKey === "unboxed_waiting_process") {
      return records.filter((r) => isUnboxedWaitingOnProcess(r, range));
    }
    return records;
  }, [kpiKey, records, range]);

  const isVModaCohort = useMemo(() => {
    if (kpiKey?.startsWith("vmoda_")) return true;
    return cohortRecords.length > 0 && cohortRecords.every(isVModaRecord);
  }, [kpiKey, cohortRecords]);

  const isDemoCohort = useMemo(() => {
    if (kpiKey?.startsWith("demo_")) return true;
    return cohortRecords.length > 0 && cohortRecords.every(isDemoRecord);
  }, [kpiKey, cohortRecords]);

  const isKantoCohort = useMemo(() => {
    if (kpiKey?.startsWith("kanto_")) return true;
    return cohortRecords.length > 0 && cohortRecords.every(isKantoRecord);
  }, [kpiKey, cohortRecords]);

  const isUnboxedCohort = useMemo(() => {
    if (kpiKey?.startsWith("unboxed_")) return true;
    return cohortRecords.length > 0 && cohortRecords.every(isUnboxedRecord);
  }, [kpiKey, cohortRecords]);

  // Search filter & sort
  const filteredRecords = useMemo(() => {
    let result = cohortRecords;

    // Apply Due Date filter for Kanto Waiting on Process
    if (kpiKey === "kanto_waiting_process" && dueFilter !== "all") {
      result = result.filter((r) => {
        const dueDate = getKantoAssemblingDueDate(r);
        if (!dueDate) return dueFilter === "within";
        return dueFilter === "overdue"
          ? isKantoDueDateOverdue(dueDate)
          : isKantoDueDateWithin(dueDate);
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((r) => {
        const orderNo = (
          getRecordCol(r, "Order Number") ??
          getRecordCol(r, "Order no.") ??
          getRecordCol(r, "without #") ??
          getRecordCol(r, "Order No") ??
          r.id ??
          ""
        ).toLowerCase();
        const sku = (
          getRecordCol(r, "Product Name") ??
          getRecordCol(r, "SKU") ??
          ""
        ).toLowerCase();
        const customer = (
          getRecordCol(r, "Customer Name") ??
          getRecordCol(r, "Email id") ??
          getRecordCol(r, "Name") ??
          r.title ??
          ""
        ).toLowerCase();
        const status = (
          getKantoStatus(r) ||
          getRecordCol(r, "Dispatch status") ||
          getRecordCol(r, "Status") ||
          getRecordStatus(r) ||
          ""
        ).toLowerCase();
        const assembled = (
          getRecordCol(r, "Assembled? ") ??
          getRecordCol(r, "Assembled?") ??
          ""
        ).toLowerCase();
        const availability = (
          getRecordCol(r, "Availability ") ??
          getRecordCol(r, "Availability") ??
          ""
        ).toLowerCase();
        const action = (
          getRecordCol(r, "AWB ") ??
          getRecordCol(r, "AWB") ??
          getRecordCol(r, "Action taken") ??
          getRecordCol(r, "Remark") ??
          ""
        ).toLowerCase();
        return (
          orderNo.includes(q) ||
          sku.includes(q) ||
          customer.includes(q) ||
          status.includes(q) ||
          assembled.includes(q) ||
          availability.includes(q) ||
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
        const idA =
          getRecordCol(a, "Order Number") ??
          getRecordCol(a, "Order no.") ??
          getRecordCol(a, "without #") ??
          getRecordCol(a, "Order No") ??
          a.id ??
          "";
        const idB =
          getRecordCol(b, "Order Number") ??
          getRecordCol(b, "Order no.") ??
          getRecordCol(b, "without #") ??
          getRecordCol(b, "Order No") ??
          b.id ??
          "";
        return sortAsc ? idA.localeCompare(idB) : idB.localeCompare(idA);
      }
      // Default: date descending
      const dateA = getRecordOrderDate(a)?.getTime() ?? 0;
      const dateB = getRecordOrderDate(b)?.getTime() ?? 0;
      return sortAsc ? dateA - dateB : dateB - dateA;
    });
  }, [cohortRecords, search, sortField, sortAsc, dueFilter, kpiKey]);

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
    if (isDemoCohort) {
      const headers = [
        "Order Number",
        "Order Date",
        "Customer Name",
        "Amount (INR)",
        "Product Name",
        "Inspection Status",
        "Generate AWB?",
        "AWB",
        "Dispatch status",
        "Shopify Admin URL",
      ];

      const rows = filteredRecords.map((r) => {
        const orderNo =
          getRecordCol(r, "Order Number") ??
          getRecordCol(r, "Order no.") ??
          getRecordCol(r, "Order No") ??
          r.id ??
          "";
        const cleanId = orderNo.replace(/^#/, "").trim();
        const orderDate = formatDateDisplay(getRecordOrderDate(r));
        const customer = getRecordCol(r, "Customer Name") ?? getRecordCol(r, "Name") ?? "";
        const amt = getRecordAmount(r) ?? 0;
        const product = (getRecordCol(r, "Product Name") ?? getRecordCol(r, "SKU") ?? "").trim();
        const insp = getRecordCol(r, "Inspection & Check Status") ?? "Pending";
        const genAwb = getRecordCol(r, "Generate AWB?") ?? "";
        const awb = getRecordCol(r, "AWB ") ?? getRecordCol(r, "AWB") ?? "";
        const disp = getRecordCol(r, "Dispatch status") ?? "";
        const shopifyUrl = `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(
          cleanId
        )}`;

        return [
          `"${orderNo.replace(/"/g, '""')}"`,
          `"${orderDate}"`,
          `"${customer.replace(/"/g, '""')}"`,
          amt,
          `"${product.replace(/"/g, '""')}"`,
          `"${insp.replace(/"/g, '""')}"`,
          `"${genAwb.replace(/"/g, '""')}"`,
          `"${awb.replace(/"/g, '""')}"`,
          `"${disp.replace(/"/g, '""')}"`,
          `"${shopifyUrl}"`,
        ].join(",");
      });

      const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${kpiTitle.toLowerCase().replace(/\s+/g, "-")}-demo-units.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (isKantoCohort) {
      const headers = [
        "Order Number",
        "Order Date",
        "Amount (INR)",
        "SKU",
        "Assembled?",
        "Fulfillment Status",
        "Assembling Due Date",
        "Due Status",
        "Shopify Admin URL",
      ];

      const rows = filteredRecords.map((r) => {
        const rawOrderNo =
          getRecordCol(r, "Order Number") ??
          getRecordCol(r, "Order no.") ??
          getRecordCol(r, "Order No") ??
          r.id ??
          "";
        const cleanId = String(rawOrderNo).replace(/^#/, "").trim();
        const orderDate = formatDateDisplay(getRecordOrderDate(r));
        const amt = getRecordAmount(r) ?? 0;
        const sku = getRecordCol(r, "SKU") ?? "";
        const assembled =
          getRecordCol(r, "Assembled? ") ??
          getRecordCol(r, "Assembled?") ??
          getRecordCol(r, "Assembled") ??
          "";
        const status = getKantoStatus(r) || "Pending";
        const dueDate = getKantoAssemblingDueDate(r);
        const dueDateStr = formatDateDisplay(dueDate);
        const dueStatus = dueDate
          ? isKantoDueDateOverdue(dueDate)
            ? "Overdue"
            : "Within Due Date"
          : "—";
        const rawShopifyLink = (getRecordCol(r, "Shopify Order Link") ?? "").trim();
        const shopifyUrl =
          rawShopifyLink && rawShopifyLink.startsWith("http")
            ? rawShopifyLink
            : `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(
                cleanId
              )}`;

        return [
          `"${String(rawOrderNo).replace(/"/g, '""')}"`,
          `"${orderDate}"`,
          amt,
          `"${sku.replace(/"/g, '""')}"`,
          `"${assembled.replace(/"/g, '""')}"`,
          `"${status.replace(/"/g, '""')}"`,
          `"${dueDateStr}"`,
          `"${dueStatus}"`,
          `"${shopifyUrl}"`,
        ].join(",");
      });

      const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${kpiTitle.toLowerCase().replace(/\s+/g, "-")}-kanto-orders.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (isUnboxedCohort) {
      const headers = [
        "Order Number",
        "Order Date",
        "Amount (INR)",
        "SKU",
        "Availability",
        "Status",
        "Images Required",
        "Confirmation Due Date",
        "Other Color/Variant Availability",
        "Image Drive Link",
        "Shopify Admin URL",
      ];

      const rows = filteredRecords.map((r) => {
        const rawOrderNo =
          getRecordCol(r, "Order Number") ??
          getRecordCol(r, "Order no.") ??
          getRecordCol(r, "Order No") ??
          r.id ??
          "";
        const cleanId = String(rawOrderNo).replace(/^#/, "").trim();
        const orderDate = formatDateDisplay(getRecordOrderDate(r));
        const amt = getRecordAmount(r) ?? 0;
        const sku = getRecordCol(r, "SKU") ?? "";
        const avail =
          getRecordCol(r, "Availability ") ??
          getRecordCol(r, "Availability") ??
          "";
        const status = getRecordCol(r, "Status") ?? getRecordStatus(r) ?? "Pending";
        const imagesReq = getRecordCol(r, "Images Required(Yes/No)") ?? "";
        const confDueDate = getUnboxedConfirmationDueDate(r);
        const confDueDateStr = formatDateDisplay(confDueDate);
        const otherColor = getRecordCol(r, "Other Color/Variant Availability") ?? "";
        const driveLink = getRecordCol(r, "Image Drive Link (Chennai)") ?? "";
        const rawShopifyLink = (getRecordCol(r, "Shopify Order Link") ?? "").trim();
        const shopifyUrl =
          rawShopifyLink && rawShopifyLink.startsWith("http")
            ? rawShopifyLink
            : `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(
                cleanId
              )}`;

        return [
          `"${String(rawOrderNo).replace(/"/g, '""')}"`,
          `"${orderDate}"`,
          amt,
          `"${sku.replace(/"/g, '""')}"`,
          `"${avail.replace(/"/g, '""')}"`,
          `"${status.replace(/"/g, '""')}"`,
          `"${imagesReq.replace(/"/g, '""')}"`,
          `"${confDueDateStr}"`,
          `"${otherColor.replace(/"/g, '""')}"`,
          `"${driveLink.replace(/"/g, '""')}"`,
          `"${shopifyUrl}"`,
        ].join(",");
      });

      const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${kpiTitle.toLowerCase().replace(/\s+/g, "-")}-unboxed-products.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (isVModaCohort) {
      const headers = [
        "Order Number",
        "Order Date",
        "Customer Email",
        "Amount (INR)",
        "SKU",
        "Engraving Requested",
        "Status",
        "Remark",
        "Dispatched",
        "Shopify Admin URL",
      ];

      const rows = filteredRecords.map((r) => {
        const orderNo =
          getRecordCol(r, "Order no.") ?? getRecordCol(r, "Order No") ?? r.id ?? "";
        const cleanId = orderNo.replace(/^#/, "").trim();
        const orderDate = formatDateDisplay(getRecordOrderDate(r));
        const email = getRecordCol(r, "Email id") ?? "";
        const amt = getRecordAmount(r) ?? 0;
        const sku = getRecordCol(r, "SKU") ?? "";
        const wantsEngraved = getRecordCol(r, "Wants it Engraved?") ?? "";
        const status = getRecordCol(r, "Status") ?? getRecordStatus(r);
        const remark = getRecordCol(r, "Remark") ?? "";
        const dispatched =
          getRecordCol(r, "Dispatched or Not ") ??
          getRecordCol(r, "Dispatched or Not") ??
          getRecordCol(r, "Dispatched") ??
          "";
        const shopifyUrl = `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(
          cleanId
        )}`;

        return [
          `"${orderNo.replace(/"/g, '""')}"`,
          `"${orderDate}"`,
          `"${email.replace(/"/g, '""')}"`,
          amt,
          `"${sku.replace(/"/g, '""')}"`,
          `"${wantsEngraved.replace(/"/g, '""')}"`,
          `"${status.replace(/"/g, '""')}"`,
          `"${remark.replace(/"/g, '""')}"`,
          `"${dispatched.replace(/"/g, '""')}"`,
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
      return;
    }

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
      : kpiKey === "vmoda_waiting_customer"
      ? Users
      : kpiKey === "vmoda_waiting_logo"
      ? Palette
      : kpiKey === "vmoda_waiting_engraving"
      ? Sparkles
      : kpiKey === "vmoda_pending_dispatch"
      ? PackageCheck
      : kpiKey === "demo_received_not_processed"
      ? ClipboardList
      : kpiKey === "demo_processed_not_dispatched"
      ? PackageCheck
      : kpiKey === "kanto_waiting_assembly"
      ? Wrench
      : kpiKey === "kanto_waiting_process"
      ? Clock
      : kpiKey === "kanto_dispatched"
      ? Truck
      : Layers;

  const headerTheme =
    kpiKey === "not_yet_processed" ||
    kpiKey === "vmoda_waiting_engraving" ||
    kpiKey === "demo_received_not_processed" ||
    kpiKey === "kanto_waiting_assembly"
      ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
      : kpiKey === "not_yet_delivered" || kpiKey === "kanto_waiting_process"
      ? "text-indigo-500 bg-indigo-500/10 border-indigo-500/20"
      : kpiKey === "vmoda_waiting_logo"
      ? "text-purple-500 bg-purple-500/10 border-purple-500/20"
      : kpiKey === "vmoda_pending_dispatch" || kpiKey === "kanto_dispatched"
      ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
      : "text-[#0284C7] bg-[#0284C7]/10 border-[#0284C7]/20";

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-lenis-prevent
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-lenis-prevent
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
                {isKantoCohort
                  ? "Kanto Products"
                  : isDemoCohort
                  ? "Demo Units To be Dispatch"
                  : isVModaCohort
                  ? "V-MODA Engraving Orders"
                  : "Above ₹50,000 High-Value Orders"}{" "}
                &bull; Direct Google Sheet records &bull; Click order # to view in Shopify
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-2xl">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  isKantoCohort
                    ? "Search by order #, SKU, assembled, status..."
                    : isDemoCohort
                    ? "Search by order #, product, customer, AWB, status..."
                    : isVModaCohort
                    ? "Search by order #, SKU, customer email, status, remark..."
                    : "Search by order #, SKU, customer, courier, status..."
                }
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

            {/* Sub-filter tabs for Kanto Waiting on Process */}
            {kpiKey === "kanto_waiting_process" && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setDueFilter("all")}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    dueFilter === "all"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  All ({cohortRecords.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDueFilter("overdue")}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    dueFilter === "overdue"
                      ? "bg-rose-500 text-white shadow-sm"
                      : "text-rose-600 dark:text-rose-400 hover:text-rose-700"
                  }`}
                >
                  Overdue ({cohortRecords.filter((r) => {
                    const d = getKantoAssemblingDueDate(r);
                    return d ? isKantoDueDateOverdue(d) : false;
                  }).length})
                </button>
                <button
                  type="button"
                  onClick={() => setDueFilter("within")}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    dueFilter === "within"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                  }`}
                >
                  Within Due Date ({cohortRecords.filter((r) => {
                    const d = getKantoAssemblingDueDate(r);
                    return d ? isKantoDueDateWithin(d) : true;
                  }).length})
                </button>
              </div>
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
          data-lenis-prevent
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
          ) : isDemoCohort ? (
            /* Demo Units Table */
            <table className="w-full text-left text-xs border-collapse min-w-[760px]">
              <thead className="sticky top-0 z-10 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[10.5px]">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">Order Number</th>
                  <th className="py-2.5 px-3 sm:px-4">Order Date</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Amount</th>
                  <th className="py-2.5 px-3 sm:px-4">Product Name</th>
                  <th className="py-2.5 px-3 sm:px-4">Customer</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Inspection</th>
                  <th className="py-2.5 px-3 sm:px-4">AWB / Tracking</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Dispatch Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredRecords.map((r, i) => {
                  const orderNo =
                    getRecordCol(r, "Order Number") ??
                    getRecordCol(r, "Order no.") ??
                    getRecordCol(r, "Order No") ??
                    r.id ??
                    `Row ${r.row}`;
                  const cleanOrderId = orderNo.replace(/^#/, "").trim();
                  const shopifyUrl = `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(
                    cleanOrderId
                  )}`;

                  const orderDate = formatDateDisplay(getRecordOrderDate(r));
                  const amt = getRecordAmount(r);
                  const product = (
                    getRecordCol(r, "Product Name") ??
                    getRecordCol(r, "SKU") ??
                    "—"
                  ).trim();
                  const productLink = getRecordCol(r, "Product page link");
                  const customer =
                    getRecordCol(r, "Customer Name") ?? getRecordCol(r, "Name") ?? "—";
                  const inspRaw = (
                    getRecordCol(r, "Inspection & Check Status") ?? ""
                  ).toLowerCase();
                  const isInspected = inspRaw === "true";
                  const awb = (getRecordCol(r, "AWB ") ?? getRecordCol(r, "AWB") ?? "").trim();
                  const disp =
                    getRecordCol(r, "Dispatch status") ??
                    getRecordCol(r, "Status") ??
                    getRecordStatus(r) ??
                    "Pending";

                  // Status badge styling
                  let statusBadgeClass =
                    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
                  const lowerDisp = disp.toLowerCase();
                  if (lowerDisp.includes("dispatched") || lowerDisp.includes("picked up")) {
                    statusBadgeClass =
                      "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40";
                  } else if (lowerDisp.includes("cancel")) {
                    statusBadgeClass =
                      "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40";
                  } else if (lowerDisp.includes("rto")) {
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

                      {/* 4. Product Name */}
                      <td className="py-2.5 px-3 sm:px-4 max-w-[240px]">
                        {productLink ? (
                          <a
                            href={productLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-700 dark:text-slate-200 hover:text-[#0284C7] dark:hover:text-[#38BDF8] line-clamp-2 transition-colors font-medium inline-flex items-center gap-1"
                            title={product}
                          >
                            <span>{product}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
                          </a>
                        ) : (
                          <span
                            className="line-clamp-2 text-slate-700 dark:text-slate-300 font-sans"
                            title={product}
                          >
                            {product}
                          </span>
                        )}
                      </td>

                      {/* 5. Customer Name */}
                      <td className="py-2.5 px-3 sm:px-4 max-w-[180px]">
                        <span
                          className="truncate text-slate-700 dark:text-slate-300 block font-medium"
                          title={customer}
                        >
                          {customer}
                        </span>
                      </td>

                      {/* 6. Inspection Status */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        {isInspected ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                            Checked
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* 7. AWB / Tracking */}
                      <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                        {awb ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px]">
                              {awb}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(awb)}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                              title="Copy AWB Number"
                            >
                              {copiedId === awb ? (
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

                      {/* 8. Dispatch Status */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadgeClass} whitespace-nowrap`}
                          title={disp}
                        >
                          {disp}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : isVModaCohort ? (
            /* V-MODA Engraving Table */
            <table className="w-full text-left text-xs border-collapse min-w-[760px]">
              <thead className="sticky top-0 z-10 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[10.5px]">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">Order Number</th>
                  <th className="py-2.5 px-3 sm:px-4">Order Date</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Amount</th>
                  <th className="py-2.5 px-3 sm:px-4">SKU / Product</th>
                  <th className="py-2.5 px-3 sm:px-4">Customer Email</th>
                  <th className="py-2.5 px-3 sm:px-4">Engraving Status</th>
                  <th className="py-2.5 px-3 sm:px-4">Remark</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Dispatched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredRecords.map((r, i) => {
                  const orderNo =
                    getRecordCol(r, "Order no.") ??
                    getRecordCol(r, "Order No") ??
                    r.id ??
                    `Row ${r.row}`;
                  const cleanOrderId = orderNo.replace(/^#/, "").trim();
                  const shopifyUrl = `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(
                    cleanOrderId
                  )}`;

                  const orderDate = formatDateDisplay(getRecordOrderDate(r));
                  const amt = getRecordAmount(r);
                  const sku = getRecordCol(r, "SKU") ?? "—";
                  const email = getRecordCol(r, "Email id") ?? "—";
                  const status =
                    getRecordCol(r, "Status") ?? getRecordStatus(r) ?? "Pending";
                  const remark = getRecordCol(r, "Remark") ?? "—";
                  const dispatchedRaw = (
                    getRecordCol(r, "Dispatched or Not ") ??
                    getRecordCol(r, "Dispatched or Not") ??
                    getRecordCol(r, "Dispatched") ??
                    ""
                  ).trim().toLowerCase();
                  const isDispatched = dispatchedRaw.includes("dispatch");

                  // Status badge styling
                  let statusBadgeClass =
                    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
                  const lowerStatus = status.toLowerCase();
                  if (lowerStatus.includes("customer")) {
                    statusBadgeClass =
                      "bg-sky-50 dark:bg-sky-950/50 text-[#0284C7] dark:text-[#38BDF8] border-sky-200 dark:border-sky-800/40";
                  } else if (lowerStatus.includes("logo")) {
                    statusBadgeClass =
                      "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/40";
                  } else if (lowerStatus.includes("engraving")) {
                    statusBadgeClass =
                      "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40";
                  } else if (lowerStatus.includes("pending on dispatch")) {
                    statusBadgeClass =
                      "bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/40";
                  } else if (lowerStatus.includes("deliver")) {
                    statusBadgeClass =
                      "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40";
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
                      <td className="py-2.5 px-3 sm:px-4 max-w-[220px]">
                        <span
                          className="line-clamp-2 text-slate-700 dark:text-slate-300 font-sans"
                          title={sku}
                        >
                          {sku}
                        </span>
                      </td>

                      {/* 5. Customer Email */}
                      <td className="py-2.5 px-3 sm:px-4 max-w-[220px]">
                        <span
                          className="truncate text-slate-600 dark:text-slate-400 font-mono text-[11px] block"
                          title={email}
                        >
                          {email}
                        </span>
                      </td>

                      {/* 6. Engraving Status */}
                      <td className="py-2.5 px-3 sm:px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadgeClass} whitespace-nowrap`}
                          title={status}
                        >
                          {status}
                        </span>
                      </td>

                      {/* 7. Remark */}
                      <td className="py-2.5 px-3 sm:px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {remark}
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
          ) : isKantoCohort ? (
            /* Kanto Products Table */
            <table className="w-full text-left text-xs border-collapse min-w-[760px]">
              <thead className="sticky top-0 z-10 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[10.5px]">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">Order Number</th>
                  <th className="py-2.5 px-3 sm:px-4">Order Date</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Amount</th>
                  <th className="py-2.5 px-3 sm:px-4">SKU / Product</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Assembled?</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Fulfillment Status</th>
                  <th className="py-2.5 px-3 sm:px-4">Assembling Due Date</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Due Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredRecords.map((r, i) => {
                  const rawOrderNo =
                    getRecordCol(r, "Order Number") ??
                    getRecordCol(r, "Order no.") ??
                    getRecordCol(r, "Order No") ??
                    r.id ??
                    `Row ${r.row}`;
                  const cleanOrderId = String(rawOrderNo).replace(/^#/, "").trim();
                  const rawShopifyLink = (getRecordCol(r, "Shopify Order Link") ?? "").trim();
                  const shopifyUrl =
                    rawShopifyLink && rawShopifyLink.startsWith("http")
                      ? rawShopifyLink
                      : `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(
                          cleanOrderId
                        )}`;

                  const orderDate = formatDateDisplay(getRecordOrderDate(r));
                  const amt = getRecordAmount(r);
                  const sku = getRecordCol(r, "SKU") ?? "—";
                  const assembledRaw = (
                    getRecordCol(r, "Assembled? ") ??
                    getRecordCol(r, "Assembled?") ??
                    getRecordCol(r, "Assembled") ??
                    ""
                  ).trim();
                  const isAssembledYes = assembledRaw.toLowerCase() === "yes";
                  const isAssembledNo = assembledRaw.toLowerCase() === "no";

                  const status = getKantoStatus(r) || "Pending";
                  const dueDate = getKantoAssemblingDueDate(r);
                  const dueDateDisplay = formatDateDisplay(dueDate);

                  let isOverdue = false;
                  if (dueDate) {
                    isOverdue = isKantoDueDateOverdue(dueDate);
                  }

                  // Status badge styling
                  let statusBadgeClass =
                    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
                  const lowerStatus = status.toLowerCase();
                  if (lowerStatus.includes("deliver")) {
                    statusBadgeClass =
                      "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40";
                  } else if (lowerStatus.includes("dispatch")) {
                    statusBadgeClass =
                      "bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/40";
                  } else if (lowerStatus.includes("transit") || lowerStatus.includes("delivery")) {
                    statusBadgeClass =
                      "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/40";
                  } else if (lowerStatus.includes("processed") || lowerStatus.includes("fulfill")) {
                    statusBadgeClass =
                      "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40";
                  } else if (lowerStatus.includes("cancel")) {
                    statusBadgeClass =
                      "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40";
                  } else if (lowerStatus.includes("stock")) {
                    statusBadgeClass =
                      "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40";
                  }

                  return (
                    <tr
                      key={r.id || `row-${r.row}-${i}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. Order Number */}
                      <td className="py-2.5 px-3 sm:px-4 font-mono font-medium whitespace-nowrap">
                        <a
                          href={shopifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#0284C7] dark:text-[#38BDF8] hover:underline font-semibold"
                          title="Open Order in Shopify Admin"
                        >
                          <span>{String(rawOrderNo).startsWith("#") ? rawOrderNo : `#${rawOrderNo}`}</span>
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
                        <span className="line-clamp-2 text-slate-700 dark:text-slate-300 font-sans" title={sku}>
                          {sku}
                        </span>
                      </td>

                      {/* 5. Assembled? */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        {isAssembledYes ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                            Yes
                          </span>
                        ) : isAssembledNo ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40">
                            No
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                            Blank / Pending
                          </span>
                        )}
                      </td>

                      {/* 6. Fulfillment Status */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadgeClass} whitespace-nowrap`}
                          title={status}
                        >
                          {status}
                        </span>
                      </td>

                      {/* 7. Assembling Due Date */}
                      <td className="py-2.5 px-3 sm:px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {dueDateDisplay}
                      </td>

                      {/* 8. Due Status */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        {dueDate ? (
                          isOverdue ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/50">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              Overdue
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/50">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Within Due Date
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : isUnboxedCohort ? (
            /* Unboxed Products Table */
            <table className="w-full text-left text-xs border-collapse min-w-[760px]">
              <thead className="sticky top-0 z-10 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[10.5px]">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">Order Number</th>
                  <th className="py-2.5 px-3 sm:px-4">Order Date</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Amount</th>
                  <th className="py-2.5 px-3 sm:px-4">SKU / Product</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Availability</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Status</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Images Req</th>
                  <th className="py-2.5 px-3 sm:px-4">Confirmation Due Date</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Drive Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredRecords.map((r, i) => {
                  const rawOrderNo =
                    getRecordCol(r, "Order Number") ??
                    getRecordCol(r, "Order no.") ??
                    getRecordCol(r, "Order No") ??
                    r.id ??
                    `Row ${r.row}`;
                  const cleanOrderId = String(rawOrderNo).replace(/^#/, "").trim();
                  const rawShopifyLink = (getRecordCol(r, "Shopify Order Link") ?? "").trim();
                  const shopifyUrl =
                    rawShopifyLink && rawShopifyLink.startsWith("http")
                      ? rawShopifyLink
                      : `https://admin.shopify.com/store/headphonezone/orders?query=${encodeURIComponent(
                          cleanOrderId
                        )}`;

                  const orderDate = formatDateDisplay(getRecordOrderDate(r));
                  const amt = getRecordAmount(r);
                  const sku = getRecordCol(r, "SKU") ?? "—";
                  const avail = (
                    getRecordCol(r, "Availability ") ??
                    getRecordCol(r, "Availability") ??
                    ""
                  ).trim();
                  const lowerAvail = avail.toLowerCase();
                  const isAvailYes = lowerAvail === "yes";
                  const isAvailNo = lowerAvail === "no";

                  const status =
                    getRecordCol(r, "Status") ?? getRecordStatus(r) ?? "Pending";
                  const lowerStatus = status.toLowerCase();

                  const imagesReq = (
                    getRecordCol(r, "Images Required(Yes/No)") ??
                    getRecordCol(r, "Images Required") ??
                    ""
                  ).trim();
                  const isImagesYes = imagesReq.toLowerCase() === "yes";

                  const confDueDate = getUnboxedConfirmationDueDate(r);
                  const confDueDateDisplay = formatDateDisplay(confDueDate);

                  const driveLink = (
                    getRecordCol(r, "Image Drive Link (Chennai)") ??
                    getRecordCol(r, "Image Drive Link") ??
                    ""
                  ).trim();

                  // Status badge styling
                  let statusBadgeClass =
                    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
                  if (lowerStatus.includes("processed") || lowerStatus.includes("fulfill")) {
                    statusBadgeClass =
                      "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40";
                  } else if (lowerStatus.includes("order received") || lowerStatus.includes("received")) {
                    statusBadgeClass =
                      "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/40";
                  } else if (lowerStatus.includes("cancel")) {
                    statusBadgeClass =
                      "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40";
                  } else if (lowerStatus.includes("deliver") || lowerStatus.includes("dispatch")) {
                    statusBadgeClass =
                      "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40";
                  }

                  return (
                    <tr
                      key={r.id || `row-${r.row}-${i}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. Order Number */}
                      <td className="py-2.5 px-3 sm:px-4 font-mono font-medium whitespace-nowrap">
                        <a
                          href={shopifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#0284C7] dark:text-[#38BDF8] hover:underline font-semibold"
                          title="Open Order in Shopify Admin"
                        >
                          <span>{String(rawOrderNo).startsWith("#") ? rawOrderNo : `#${rawOrderNo}`}</span>
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
                        <span className="line-clamp-2 text-slate-700 dark:text-slate-300 font-sans" title={sku}>
                          {sku}
                        </span>
                      </td>

                      {/* 5. Availability */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        {isAvailYes ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                            Yes
                          </span>
                        ) : isAvailNo ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40">
                            No
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                            {avail || "Blank"}
                          </span>
                        )}
                      </td>

                      {/* 6. Status */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadgeClass} whitespace-nowrap`}
                          title={status}
                        >
                          {status}
                        </span>
                      </td>

                      {/* 7. Images Required */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        {isImagesYes ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40">
                            Yes
                          </span>
                        ) : imagesReq ? (
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                            {imagesReq}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-[11px]">—</span>
                        )}
                      </td>

                      {/* 8. Confirmation Due Date */}
                      <td className="py-2.5 px-3 sm:px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {confDueDateDisplay}
                      </td>

                      {/* 9. Drive Link */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        {driveLink && driveLink.startsWith("http") ? (
                          <a
                            href={driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#0284C7] dark:text-[#38BDF8] hover:underline font-medium text-[11px]"
                            title="Open Google Drive Link"
                          >
                            <span>Drive</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                          </a>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* Above 50k Orders Table */
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
