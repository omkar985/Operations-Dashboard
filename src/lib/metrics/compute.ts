import type { FieldKey, OpsRecord } from "@/types/operations";
import { getRecordCol, getRecordStatus, parseSheetDate, serialToIso } from "@/lib/google-sheets/mapping";

/**
 * Operational metrics — pure functions over normalised records.
 *
 * Each metric declares the mapped fields it REQUIRES. If a field is not mapped the metric is marked
 * unavailable (and the UI says which column to map) — no value is ever fabricated.
 * All timestamps are interpreted exactly as they appear in the sheet (UTC wall-clock).
 */

export interface DateRange {
  /** inclusive */
  from: Date;
  /** exclusive */
  to: Date;
}

export interface MetricsConfig {
  mapped: ReadonlySet<FieldKey>;
  completedStatuses: readonly string[];
  slaTargetPercent: number;
  ageingDays: number;
  now: Date;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

export function hasCompletionInfo(cfg: MetricsConfig): boolean {
  return cfg.mapped.has("resolvedAt") || (cfg.mapped.has("status") && cfg.completedStatuses.length > 0);
}

export function isComplete(r: OpsRecord, cfg: MetricsConfig): boolean {
  if (r.resolvedAt) return true;
  const statusStr = getRecordStatus(r);
  if (statusStr && cfg.completedStatuses.length) {
    const s = statusStr.toLowerCase();
    return cfg.completedStatuses.some((c) => c.toLowerCase() === s);
  }
  return false;
}

export function isOverdue(r: OpsRecord, cfg: MetricsConfig): boolean {
  if (!r.dueAt) return false;
  return !isComplete(r, cfg) && ms(r.dueAt) < cfg.now.getTime();
}

/** Checks if a record belongs to the V-MODA subsheet / engraving cohort. */
export function isVModaRecord(r: OpsRecord): boolean {
  if (r.subsheet) {
    const s = r.subsheet.toLowerCase();
    if (s.includes("v-moda") || s.includes("vmoda")) return true;
  }
  if (r.raw) {
    return Boolean(
      getRecordCol(r, "Wants it Engraved?") !== null ||
      getRecordCol(r, "Dispatched or Not ") !== null ||
      getRecordCol(r, "Dispatched or Not") !== null ||
      getRecordCol(r, "Email id") !== null
    );
  }
  return false;
}

/** Checks if a record belongs to the Demo Units subsheet. */
export function isDemoRecord(r: OpsRecord): boolean {
  if (r.subsheet) {
    const s = r.subsheet.toLowerCase().trim();
    if (s.includes("demo")) return true;
  }
  if (r.raw) {
    return Boolean(
      getRecordCol(r, "Inspection & Check Status") !== null ||
      getRecordCol(r, "Generate AWB?") !== null ||
      getRecordCol(r, "Product page link") !== null ||
      getRecordCol(r, "Ship Label Link") !== null
    );
  }
  return false;
}

/** Checks if a record belongs to the Kanto subsheet. */
export function isKantoRecord(r: OpsRecord): boolean {
  if (r.subsheet) {
    const s = r.subsheet.toLowerCase().trim();
    if (s.includes("kanto")) return true;
  }
  if (r.raw) {
    return Boolean(
      getRecordCol(r, "Assembling Due Date") !== null ||
      getRecordCol(r, "Assembled? ") !== null ||
      getRecordCol(r, "Assembled?") !== null ||
      getRecordCol(r, "Image Drive Link (Chennai)") !== null
    );
  }
  return false;
}

/** Checks if a record belongs to the Unboxed v2 subsheet. */
export function isUnboxedRecord(r: OpsRecord): boolean {
  if (r.subsheet) {
    const s = r.subsheet.toLowerCase().trim();
    if (s.includes("unboxed")) return true;
  }
  if (r.raw) {
    return Boolean(
      getRecordCol(r, "Confirmation Due Date") !== null ||
      getRecordCol(r, "Availability") !== null ||
      getRecordCol(r, "Availability ") !== null ||
      getRecordCol(r, "Other Color/Variant Availability") !== null ||
      getRecordCol(r, "Automation (Inventory Zero)") !== null
    );
  }
  return false;
}

/** Checks if a record belongs to the Above 50k Orders subsheet. */
export function isAbove50kRecord(r: OpsRecord): boolean {
  return !isVModaRecord(r) && !isDemoRecord(r) && !isKantoRecord(r) && !isUnboxedRecord(r);
}

/**
 * Filter 1: Not Yet Processed (Pending Processing)
 * Criteria: "Action taken" is Blank AND status does not contain "cancelled" OR "SKU not mapped".
 * Optional range filter: Current month or based on filter applied.
 */
export function isNotYetProcessed(r: OpsRecord, range?: DateRange, now?: Date): boolean {
  const hasRange = Boolean(
    range &&
    typeof range === "object" &&
    range.from instanceof Date &&
    range.to instanceof Date
  );
  if (hasRange && !isMonthlyReceived(r, range, now)) {
    return false;
  }
  const actionTaken = getRecordCol(r, "Action taken");
  const isActionBlank = !actionTaken || actionTaken.trim() === "";
  const status = getRecordStatus(r).toLowerCase().trim();
  const notCancelled = !status.includes("cancel");
  const notSkuUnmapped = !status.includes("sku not mapped");
  return isActionBlank && notCancelled && notSkuUnmapped;
}

/**
 * Filter 2: Not Yet Delivered (Pending Delivery)
 * Criteria: "Delivered yes/no)" column is not set to "Yes" AND "status" does not contain word "RTO" OR "Return".
 * Optional range filter: Current month or based on filter applied.
 */
export function isNotYetDelivered(r: OpsRecord, range?: DateRange, now?: Date): boolean {
  const hasRange = Boolean(
    range &&
    typeof range === "object" &&
    range.from instanceof Date &&
    range.to instanceof Date
  );
  if (hasRange && !isMonthlyReceived(r, range, now)) {
    return false;
  }
  const delivered = getRecordCol(r, "Delivered yes/no)");
  const isDeliveredNotYes = (delivered ?? "").trim().toLowerCase() !== "yes";
  const status = getRecordStatus(r).toLowerCase().trim();
  const notDeliveredOrRtoOrReturn = !/delivered|rto|return/i.test(status);
  return isDeliveredNotYes && notDeliveredOrRtoOrReturn;
}

/**
 * V-MODA Filter 1: Waiting on Customer
 * Criteria: In V-MODA Sheet "Status" column has value set to "Waiting on Customer"
 */
export function isWaitingOnCustomer(r: OpsRecord): boolean {
  if (!isVModaRecord(r)) return false;
  const status = (getRecordCol(r, "Status") ?? getRecordStatus(r)).toLowerCase().trim();
  return status.includes("waiting on customer");
}

/**
 * V-MODA Filter 2: Waiting on Logo
 * Criteria: In V-MODA Sheet "Status" column has value set to "Waiting on Logo"
 */
export function isWaitingOnLogo(r: OpsRecord): boolean {
  if (!isVModaRecord(r)) return false;
  const status = (getRecordCol(r, "Status") ?? getRecordStatus(r)).toLowerCase().trim();
  return status.includes("waiting on logo");
}

/**
 * V-MODA Filter 3: Waiting on Engraving
 * Criteria: In V-MODA Sheet "Status" column has value set to "Waiting on Engraving"
 */
export function isWaitingOnEngraving(r: OpsRecord): boolean {
  if (!isVModaRecord(r)) return false;
  const status = (getRecordCol(r, "Status") ?? getRecordStatus(r)).toLowerCase().trim();
  return status.includes("waiting on engraving");
}

/**
 * V-MODA Filter 4: Pending on Dispatch
 * Criteria: In V-MODA Sheet "Status" column has value set to "Pending on Dispatch"
 */
export function isPendingOnDispatch(r: OpsRecord): boolean {
  if (!isVModaRecord(r)) return false;
  const status = (getRecordCol(r, "Status") ?? getRecordStatus(r)).toLowerCase().trim();
  return status.includes("pending on dispatch");
}

/**
 * Demo Filter 1: Order Received but not processed
 * Criteria: "Inspection & Check Status" is Blank AND "Generate AWB?" is Blank AND "delivery status" is Blank (not set to cancelled)
 */
export function isDemoOrderReceivedNotProcessed(r: OpsRecord): boolean {
  const insp = (getRecordCol(r, "Inspection & Check Status") ?? "").trim().toLowerCase();
  const isInspBlank = !insp || insp === "false";
  const genAwb = (getRecordCol(r, "Generate AWB?") ?? "").trim().toLowerCase();
  const isGenAwbBlank = !genAwb || genAwb === "false";
  const deliv = (getRecordCol(r, "delivery status") ?? "").trim().toLowerCase();
  const isDelivBlank = !deliv || deliv === "false" || deliv === "(blank)";
  const disp = (getRecordCol(r, "Dispatch status") ?? "").trim().toLowerCase();
  const notCancelledOrDispatched = !/cancel|dispatched|delivered|rto|return/i.test(`${disp} ${deliv}`);
  return isInspBlank && isGenAwbBlank && isDelivBlank && notCancelledOrDispatched;
}

/**
 * Demo Filter 2: Processed but not Dispatched
 * Criteria: "Generate AWB?" is filled with value "Yes" AND "AWB " column is filled AND "Dispatch status" does not contain "Dispatched", "Delivered", "Cancelled", "RTO", or "Return"
 */
export function isDemoProcessedNotDispatched(r: OpsRecord): boolean {
  const genAwb = (getRecordCol(r, "Generate AWB?") ?? "").trim().toLowerCase();
  const isGenAwbYes = genAwb === "yes";
  const awb = (getRecordCol(r, "AWB ") ?? getRecordCol(r, "AWB") ?? "").trim();
  const isAwbFilled = awb !== "" && !/cancel/i.test(awb);
  const disp = (getRecordCol(r, "Dispatch status") ?? "").trim().toLowerCase();
  const deliv = (getRecordCol(r, "delivery status") ?? "").trim().toLowerCase();
  const combined = `${disp} ${deliv}`;
  const isBlocked = /dispatched|delivered|cancel|rto|return/i.test(combined);
  return isGenAwbYes && isAwbFilled && !isBlocked;
}

/** Returns the fulfillment status for Kanto records (from Column 10 / raw Status). */
export function getKantoStatus(r: OpsRecord): string {
  const rawStatus = getRecordCol(r, "Status");
  if (rawStatus !== null && rawStatus !== undefined) return rawStatus.trim();
  return "";
}

/** Extracts the Assembling Due Date for Kanto records. */
export function getKantoAssemblingDueDate(r: OpsRecord): Date | null {
  const rawDate =
    getRecordCol(r, "Assembling Due Date") ??
    getRecordCol(r, "Assembling Due Date ") ??
    getRecordCol(r, "Due Date");
  if (!rawDate || rawDate.trim() === "" || rawDate.trim() === "(blank)") return null;
  const trimmed = rawDate.trim();
  if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) {
    const iso = serialToIso(Number(trimmed));
    if (iso) return new Date(iso);
  }
  const iso =
    parseSheetDate(trimmed, "ISO") ??
    parseSheetDate(trimmed, "DMY") ??
    parseSheetDate(trimmed, "MDY");
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const direct = new Date(trimmed);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

export function isKantoDueDateOverdue(dueDate: Date, now: Date = new Date()): boolean {
  const dueMidnight = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const todayMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return todayMidnight > dueMidnight;
}

export function isKantoDueDateWithin(dueDate: Date, now: Date = new Date()): boolean {
  const dueMidnight = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const todayMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return todayMidnight <= dueMidnight;
}

/**
 * Kanto Filter 1: Waiting on Assembly
 * Criteria: In "Kanto" sheet; "Assembled? " column is Blank.
 */
export function isKantoWaitingOnAssembly(r: OpsRecord): boolean {
  if (!isKantoRecord(r)) return false;
  const orderNo = getRecordCol(r, "Order Number") ?? getRecordCol(r, "Order no.") ?? r.id;
  if (!orderNo && !getRecordCol(r, "SKU")) return false;

  const assembled = (
    getRecordCol(r, "Assembled? ") ??
    getRecordCol(r, "Assembled?") ??
    getRecordCol(r, "Assembled") ??
    ""
  ).trim();
  return !assembled || assembled.toLowerCase() === "(blank)";
}

/**
 * Kanto Filter 2: Waiting on Process
 * Criteria: In "Kanto" sheet; "Status" does not have "Processed/Fulfilled" OR "Cancelled" OR "Delivered" OR "Dispatched".
 */
export function isKantoWaitingOnProcess(r: OpsRecord): boolean {
  if (!isKantoRecord(r)) return false;
  const orderNo = getRecordCol(r, "Order Number") ?? getRecordCol(r, "Order no.") ?? r.id;
  if (!orderNo && !getRecordCol(r, "SKU")) return false;

  const status = getKantoStatus(r).toLowerCase().trim();
  const isExcluded =
    status.includes("processed") ||
    status.includes("fulfilled") ||
    status.includes("cancel") ||
    status.includes("deliver") ||
    status.includes("dispatch");
  return !isExcluded;
}

/**
 * Kanto Filter 3: Dispatched
 * Criteria: In "Kanto" sheet; "Status" has "Dispatched" OR "Delivered".
 */
export function isKantoDispatched(r: OpsRecord): boolean {
  if (!isKantoRecord(r)) return false;
  const orderNo = getRecordCol(r, "Order Number") ?? getRecordCol(r, "Order no.") ?? r.id;
  if (!orderNo && !getRecordCol(r, "SKU")) return false;

  const status = getKantoStatus(r).toLowerCase().trim();
  return status.includes("dispatch") || status.includes("deliver");
}

/**
 * Unboxed Filter 1: Waiting on Confirmation
 * Criteria: In "Unboxed v2" sheet; "Availability " column is blank.
 * Respects active selected date range filter.
 */
export function isUnboxedWaitingOnConfirmation(
  r: OpsRecord,
  range?: DateRange,
  now?: Date,
): boolean {
  if (!isUnboxedRecord(r)) return false;
  const hasRange = Boolean(
    range &&
    typeof range === "object" &&
    range.from instanceof Date &&
    range.to instanceof Date
  );
  if (hasRange && !isMonthlyReceived(r, range, now)) return false;
  const orderNo = getRecordCol(r, "Order Number") ?? getRecordCol(r, "Order no.") ?? r.id;
  if (!orderNo && !getRecordCol(r, "SKU")) return false;

  const avail = (
    getRecordCol(r, "Availability ") ??
    getRecordCol(r, "Availability") ??
    ""
  ).trim();
  return !avail || avail.toLowerCase() === "(blank)";
}

/**
 * Unboxed Filter 2: Waiting on Process
 * Criteria: In "Unboxed v2" sheet; "Availability " column has value "Yes" AND "Status" column is not equal to "Processed" AND "Status" column should not contain value "Cancelled ".
 * Respects active selected date range filter.
 */
export function isUnboxedWaitingOnProcess(
  r: OpsRecord,
  range?: DateRange,
  now?: Date,
): boolean {
  if (!isUnboxedRecord(r)) return false;
  const hasRange = Boolean(
    range &&
    typeof range === "object" &&
    range.from instanceof Date &&
    range.to instanceof Date
  );
  if (hasRange && !isMonthlyReceived(r, range, now)) return false;
  const orderNo = getRecordCol(r, "Order Number") ?? getRecordCol(r, "Order no.") ?? r.id;
  if (!orderNo && !getRecordCol(r, "SKU")) return false;

  const avail = (
    getRecordCol(r, "Availability ") ??
    getRecordCol(r, "Availability") ??
    ""
  ).trim().toLowerCase();
  if (avail !== "yes") return false;

  const status = (
    getRecordCol(r, "Status") ??
    getRecordStatus(r) ??
    ""
  ).trim().toLowerCase();

  const isProcessed = status === "processed";
  const isCancelled = status.includes("cancel");

  return !isProcessed && !isCancelled;
}

/** Extracts the Confirmation Due Date for Unboxed records. */
export function getUnboxedConfirmationDueDate(r: OpsRecord): Date | null {
  const rawDate =
    getRecordCol(r, "Confirmation Due Date") ??
    getRecordCol(r, "Confirmation Due Date ") ??
    getRecordCol(r, "Due Date");
  if (!rawDate || rawDate.trim() === "" || rawDate.trim() === "(blank)") return null;
  const trimmed = rawDate.trim();
  if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) {
    const iso = serialToIso(Number(trimmed));
    if (iso) return new Date(iso);
  }
  const iso =
    parseSheetDate(trimmed, "ISO") ??
    parseSheetDate(trimmed, "DMY") ??
    parseSheetDate(trimmed, "MDY");
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const direct = new Date(trimmed);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

/** Extracts and normalizes the order date from record createdAt or raw columns. */
export function getRecordOrderDate(r: OpsRecord): Date | null {
  // If record belongs to Above 50k Orders, strictly apply date filter on "Order Date" column:
  if (isAbove50kRecord(r)) {
    const rawDate = getRecordCol(r, "Order Date");
    if (!rawDate || rawDate.trim() === "" || rawDate.trim() === "(blank)") return null;
    const trimmed = rawDate.trim();
    if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) {
      const iso = serialToIso(Number(trimmed));
      if (iso) {
        const d = new Date(iso);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    const iso =
      parseSheetDate(trimmed, "ISO") ??
      parseSheetDate(trimmed, "DMY") ??
      parseSheetDate(trimmed, "MDY");
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const direct = new Date(trimmed);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  if (r.createdAt) {
    const d = new Date(r.createdAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const rawDate =
    getRecordCol(r, " Order Timestamp") ??
    getRecordCol(r, "Order Timestamp") ??
    getRecordCol(r, "Date and time stamp") ??
    getRecordCol(r, "Date and timestamp") ??
    getRecordCol(r, "Order Date") ??
    getRecordCol(r, "Date") ??
    getRecordCol(r, "created");
  if (!rawDate || rawDate.trim() === "" || rawDate.trim() === "(blank)") return null;
  const trimmed = rawDate.trim();
  if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) {
    const iso = serialToIso(Number(trimmed));
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const iso =
    parseSheetDate(trimmed, "ISO") ??
    parseSheetDate(trimmed, "DMY") ??
    parseSheetDate(trimmed, "MDY");
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;
  return null;
}

/** Extracts the numeric order amount (e.g. from Amt or Amount). */
export function getRecordAmount(r: OpsRecord): number | null {
  const rawAmt =
    getRecordCol(r, "Total Order Value") ??
    getRecordCol(r, "Amt") ??
    getRecordCol(r, "Amount") ??
    getRecordCol(r, "Order Amount") ??
    getRecordCol(r, "Order Value ") ??
    getRecordCol(r, "Order Value") ??
    getRecordCol(r, "Total");
  if (rawAmt === null || rawAmt === undefined) return null;
  const cleaned = String(rawAmt).replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Filter: Monthly Received
 * Criteria: Order placed in the active date range or current calendar month.
 */
export function isMonthlyReceived(r: OpsRecord, range?: DateRange, now: Date = new Date()): boolean {
  const d = getRecordOrderDate(r);
  if (!d) return false;
  if (
    range &&
    typeof range === "object" &&
    range.from instanceof Date &&
    !Number.isNaN(range.from.getTime()) &&
    range.to instanceof Date &&
    !Number.isNaN(range.to.getTime())
  ) {
    const t = d.getTime();
    return t >= range.from.getTime() && t < range.to.getTime();
  }
  const refDate = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return d.getUTCFullYear() === refDate.getUTCFullYear() && d.getUTCMonth() === refDate.getUTCMonth();
}

const within = (iso: string | null, range: DateRange) => {
  const t = ms(iso);
  if (!range || !range.from || !range.to) return false;
  return !Number.isNaN(t) && t >= range.from.getTime() && t < range.to.getTime();
};

export function previousRange(range: DateRange): DateRange {
  const len = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - len), to: new Date(range.from.getTime()) };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ----------------------------------------------------------------------------- KPIs

export type KpiKey =
  | "monthly_received"
  | "not_yet_processed"
  | "not_yet_delivered"
  | "vmoda_waiting_customer"
  | "vmoda_waiting_logo"
  | "vmoda_waiting_engraving"
  | "vmoda_pending_dispatch"
  | "demo_received_not_processed"
  | "demo_processed_not_dispatched"
  | "kanto_waiting_assembly"
  | "kanto_waiting_process"
  | "kanto_dispatched"
  | "unboxed_waiting_confirmation"
  | "unboxed_waiting_process"
  | "open"
  | "created"
  | "resolved"
  | "overdue"
  | "sla"
  | "ttr";

export type KpiUnit = "count" | "percent" | "hours";

export interface Kpi {
  key: KpiKey;
  label: string;
  /** Plain-language definition shown in the UI so every number has a defined source. */
  definition: string;
  requires: FieldKey[];
  available: boolean;
  missing: FieldKey[];
  value: number | null;
  unit: KpiUnit;
  previous: number | null;
  /** Relative change vs. previous period, percent (null when not comparable). */
  deltaPct: number | null;
  /** Which direction is an improvement. */
  good: "up" | "down";
  sparkline: number[];
  /** Sample size behind a ratio/median. */
  sample?: number;
  target?: number;
  /** Total order value in INR (e.g. for high-value orders). */
  totalAmount?: number;
  /** Breakdown for Kanto Waiting on Process */
  overdueCount?: number;
  withinDueCount?: number;
}

function mk(
  partial: Omit<Kpi, "available" | "missing" | "previous" | "deltaPct" | "sparkline" | "value"> & Partial<Kpi>,
  cfg: MetricsConfig,
): Kpi {
  const missing = partial.requires.filter((f) => !cfg.mapped.has(f));
  return { value: null, previous: null, deltaPct: null, sparkline: [], available: missing.length === 0, missing, ...partial };
}

const pctDelta = (cur: number | null, prev: number | null) =>
  cur === null || prev === null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100;

export function computeKpis(records: OpsRecord[], range: DateRange, cfg: MetricsConfig): Kpi[] {
  const prev = previousRange(range);
  const starts = bucketStarts(range);
  const step = granularityFor(range) === "day" ? DAY : 7 * DAY;

  // 1. Monthly Orders Received (Requested KPI: Monthly Received count)
  const monthlyReceivedOrders = records.filter((r) => isMonthlyReceived(r, range, cfg.now));
  const monthlyReceivedTotalAmt = monthlyReceivedOrders.reduce((sum, r) => sum + (getRecordAmount(r) ?? 0), 0);

  const monthlyReceived = mk(
    {
      key: "monthly_received",
      label: "Monthly Orders Received",
      definition: 'Orders in Above 50k Orders sheet where "Order Date" falls in active monthly period / selected range.',
      requires: [],
      unit: "count",
      good: "up",
    },
    cfg,
  );
  monthlyReceived.available = true;
  monthlyReceived.value = monthlyReceivedOrders.length;
  monthlyReceived.totalAmount = monthlyReceivedTotalAmt;

  const prevMonthlyOrders = records.filter((r) => isMonthlyReceived(r, prev, cfg.now));
  monthlyReceived.previous = prevMonthlyOrders.length;
  monthlyReceived.deltaPct = pctDelta(monthlyReceived.value, monthlyReceived.previous);
  monthlyReceived.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return records.filter((r) => {
      const d = getRecordOrderDate(r);
      return Boolean(d && d.getTime() >= lo && d.getTime() < hi);
    }).length;
  });

  // 2. Pending Processing (Requested KPI: Not Yet Processed - renamed professionally)
  const pendingProcessingOrders = records.filter((r) => isNotYetProcessed(r, range, cfg.now));
  const pendingProcessingTotalAmt = pendingProcessingOrders.reduce((sum, r) => sum + (getRecordAmount(r) ?? 0), 0);

  const notYetProcessed = mk(
    {
      key: "not_yet_processed",
      label: "Pending Processing",
      definition: 'Orders in range where "Action taken" is blank and status does not contain "cancelled" or "SKU not mapped".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg,
  );
  notYetProcessed.available = true;
  notYetProcessed.value = pendingProcessingOrders.length;
  notYetProcessed.totalAmount = pendingProcessingTotalAmt;

  const prevProcInRange = records.filter((r) => isNotYetProcessed(r, prev, cfg.now)).length;
  notYetProcessed.previous = prevProcInRange;
  notYetProcessed.deltaPct = pctDelta(notYetProcessed.value, prevProcInRange);
  notYetProcessed.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return records.filter((r) => {
      const d = getRecordOrderDate(r);
      return Boolean(d && d.getTime() >= lo && d.getTime() < hi && isNotYetProcessed(r));
    }).length;
  });

  // 3. Pending Delivery (Requested KPI: Not Yet Delivered - renamed professionally)
  const pendingDeliveryOrders = records.filter((r) => isNotYetDelivered(r, range, cfg.now));
  const pendingDeliveryTotalAmt = pendingDeliveryOrders.reduce((sum, r) => sum + (getRecordAmount(r) ?? 0), 0);

  const notYetDelivered = mk(
    {
      key: "not_yet_delivered",
      label: "Pending Delivery",
      definition: 'Orders in range where "Delivered yes/no)" is not "Yes" and status does not contain "RTO" or "Return".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg,
  );
  notYetDelivered.available = true;
  notYetDelivered.value = pendingDeliveryOrders.length;
  notYetDelivered.totalAmount = pendingDeliveryTotalAmt;

  const prevDelivInRange = records.filter((r) => isNotYetDelivered(r, prev, cfg.now)).length;
  notYetDelivered.previous = prevDelivInRange;
  notYetDelivered.deltaPct = pctDelta(notYetDelivered.value, prevDelivInRange);
  notYetDelivered.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return records.filter((r) => {
      const d = getRecordOrderDate(r);
      return Boolean(d && d.getTime() >= lo && d.getTime() < hi && isNotYetDelivered(r));
    }).length;
  });

  return [monthlyReceived, notYetProcessed, notYetDelivered];
}

export function computeVModaKpis(
  records: OpsRecord[],
  range: DateRange,
  cfg: MetricsConfig,
): Kpi[] {
  const vmodaRecords = records.filter(isVModaRecord);
  const prev = previousRange(range);
  const starts = bucketStarts(range);
  const step = granularityFor(range) === "day" ? DAY : 7 * DAY;

  // 1. Waiting on Customer
  const waitingCustOrders = vmodaRecords.filter(isWaitingOnCustomer);
  const waitingCustTotalAmt = waitingCustOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const waitingCustomer = mk(
    {
      key: "vmoda_waiting_customer",
      label: "Waiting on Customer",
      definition: 'In V-MODA Sheet, "Status" column has value set to "Waiting on Customer".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  waitingCustomer.available = true;
  waitingCustomer.value = waitingCustOrders.length;
  waitingCustomer.totalAmount = waitingCustTotalAmt;
  const curCustInRange = vmodaRecords.filter(
    (r) => isMonthlyReceived(r, range, cfg.now) && isWaitingOnCustomer(r)
  ).length;
  const prevCustInRange = vmodaRecords.filter(
    (r) => isMonthlyReceived(r, prev, cfg.now) && isWaitingOnCustomer(r)
  ).length;
  waitingCustomer.previous = prevCustInRange;
  waitingCustomer.deltaPct = pctDelta(curCustInRange, prevCustInRange);
  waitingCustomer.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return vmodaRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isWaitingOnCustomer(r);
    }).length;
  });

  // 2. Waiting on Logo
  const waitingLogoOrders = vmodaRecords.filter(isWaitingOnLogo);
  const waitingLogoTotalAmt = waitingLogoOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const waitingLogo = mk(
    {
      key: "vmoda_waiting_logo",
      label: "Waiting on Logo",
      definition: 'In V-MODA Sheet, "Status" column has value set to "Waiting on Logo".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  waitingLogo.available = true;
  waitingLogo.value = waitingLogoOrders.length;
  waitingLogo.totalAmount = waitingLogoTotalAmt;
  const curLogoInRange = vmodaRecords.filter(
    (r) => isMonthlyReceived(r, range, cfg.now) && isWaitingOnLogo(r)
  ).length;
  const prevLogoInRange = vmodaRecords.filter(
    (r) => isMonthlyReceived(r, prev, cfg.now) && isWaitingOnLogo(r)
  ).length;
  waitingLogo.previous = prevLogoInRange;
  waitingLogo.deltaPct = pctDelta(curLogoInRange, prevLogoInRange);
  waitingLogo.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return vmodaRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isWaitingOnLogo(r);
    }).length;
  });

  // 3. Waiting on Engraving
  const waitingEngrOrders = vmodaRecords.filter(isWaitingOnEngraving);
  const waitingEngrTotalAmt = waitingEngrOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const waitingEngraving = mk(
    {
      key: "vmoda_waiting_engraving",
      label: "Waiting on Engraving",
      definition: 'In V-MODA Sheet, "Status" column has value set to "Waiting on Engraving".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  waitingEngraving.available = true;
  waitingEngraving.value = waitingEngrOrders.length;
  waitingEngraving.totalAmount = waitingEngrTotalAmt;
  const curEngrInRange = vmodaRecords.filter(
    (r) => isMonthlyReceived(r, range, cfg.now) && isWaitingOnEngraving(r)
  ).length;
  const prevEngrInRange = vmodaRecords.filter(
    (r) => isMonthlyReceived(r, prev, cfg.now) && isWaitingOnEngraving(r)
  ).length;
  waitingEngraving.previous = prevEngrInRange;
  waitingEngraving.deltaPct = pctDelta(curEngrInRange, prevEngrInRange);
  waitingEngraving.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return vmodaRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isWaitingOnEngraving(r);
    }).length;
  });

  // 4. Pending on Dispatch
  const pendingDispatchOrders = vmodaRecords.filter(isPendingOnDispatch);
  const pendingDispatchTotalAmt = pendingDispatchOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const pendingDispatch = mk(
    {
      key: "vmoda_pending_dispatch",
      label: "Pending on Dispatch",
      definition: 'In V-MODA Sheet, "Status" column has value set to "Pending on Dispatch".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  pendingDispatch.available = true;
  pendingDispatch.value = pendingDispatchOrders.length;
  pendingDispatch.totalAmount = pendingDispatchTotalAmt;
  const curDispInRange = vmodaRecords.filter(
    (r) => isMonthlyReceived(r, range, cfg.now) && isPendingOnDispatch(r)
  ).length;
  const prevDispInRange = vmodaRecords.filter(
    (r) => isMonthlyReceived(r, prev, cfg.now) && isPendingOnDispatch(r)
  ).length;
  pendingDispatch.previous = prevDispInRange;
  pendingDispatch.deltaPct = pctDelta(curDispInRange, prevDispInRange);
  pendingDispatch.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return vmodaRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isPendingOnDispatch(r);
    }).length;
  });

  return [waitingCustomer, waitingLogo, waitingEngraving, pendingDispatch];
}

export function computeDemoKpis(
  records: OpsRecord[],
  range: DateRange,
  cfg: MetricsConfig,
): Kpi[] {
  const demoRecords = records.filter(isDemoRecord);
  const prev = previousRange(range);
  const starts = bucketStarts(range);
  const step = granularityFor(range) === "day" ? DAY : 7 * DAY;

  // 1. Order Received but not processed
  const receivedNotProcOrders = demoRecords.filter(isDemoOrderReceivedNotProcessed);
  const receivedNotProcTotalAmt = receivedNotProcOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const receivedNotProc = mk(
    {
      key: "demo_received_not_processed",
      label: "Order Received but not processed",
      definition:
        'Demo units where "Inspection & Check Status" is blank, "Generate AWB?" is blank, and "delivery status" is blank.',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  receivedNotProc.available = true;
  receivedNotProc.value = receivedNotProcOrders.length;
  receivedNotProc.totalAmount = receivedNotProcTotalAmt;
  const curRecInRange = demoRecords.filter(
    (r) => isMonthlyReceived(r, range, cfg.now) && isDemoOrderReceivedNotProcessed(r)
  ).length;
  const prevRecInRange = demoRecords.filter(
    (r) => isMonthlyReceived(r, prev, cfg.now) && isDemoOrderReceivedNotProcessed(r)
  ).length;
  receivedNotProc.previous = prevRecInRange;
  receivedNotProc.deltaPct = pctDelta(curRecInRange, prevRecInRange);
  receivedNotProc.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return demoRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isDemoOrderReceivedNotProcessed(r);
    }).length;
  });

  // 2. Processed but not Dispatched
  const procNotDispOrders = demoRecords.filter(isDemoProcessedNotDispatched);
  const procNotDispTotalAmt = procNotDispOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const procNotDisp = mk(
    {
      key: "demo_processed_not_dispatched",
      label: "Processed but not Dispatched",
      definition:
        'Demo units where "Generate AWB?" is "Yes", "AWB" is filled, and "Dispatch status" does not contain "Dispatched", "Delivered", "Cancelled", "RTO", or "Return".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  procNotDisp.available = true;
  procNotDisp.value = procNotDispOrders.length;
  procNotDisp.totalAmount = procNotDispTotalAmt;
  const curProcInRange = demoRecords.filter(
    (r) => isMonthlyReceived(r, range, cfg.now) && isDemoProcessedNotDispatched(r)
  ).length;
  const prevProcInRange = demoRecords.filter(
    (r) => isMonthlyReceived(r, prev, cfg.now) && isDemoProcessedNotDispatched(r)
  ).length;
  procNotDisp.previous = prevProcInRange;
  procNotDisp.deltaPct = pctDelta(curProcInRange, prevProcInRange);
  procNotDisp.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return demoRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isDemoProcessedNotDispatched(r);
    }).length;
  });

  return [receivedNotProc, procNotDisp];
}

export function computeKantoKpis(
  records: OpsRecord[],
  range: DateRange,
  cfg: MetricsConfig,
): Kpi[] {
  const kantoRecords = records.filter(isKantoRecord);
  const prev = previousRange(range);
  const starts = bucketStarts(range);
  const step = granularityFor(range) === "day" ? DAY : 7 * DAY;

  // 1. Waiting on Assembly
  const waitingAssemblyOrders = kantoRecords.filter(isKantoWaitingOnAssembly);
  const waitingAssemblyTotalAmt = waitingAssemblyOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const waitingAssembly = mk(
    {
      key: "kanto_waiting_assembly",
      label: "Waiting on Assembly",
      definition: 'In "Kanto" sheet, "Assembled? " column is Blank.',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  waitingAssembly.available = true;
  waitingAssembly.value = waitingAssemblyOrders.length;
  waitingAssembly.totalAmount = waitingAssemblyTotalAmt;
  const curAssemblyInRange = kantoRecords.filter(
    (r) => isMonthlyReceived(r, range, cfg.now) && isKantoWaitingOnAssembly(r)
  ).length;
  const prevAssemblyInRange = kantoRecords.filter(
    (r) => isMonthlyReceived(r, prev, cfg.now) && isKantoWaitingOnAssembly(r)
  ).length;
  waitingAssembly.previous = prevAssemblyInRange;
  waitingAssembly.deltaPct = pctDelta(curAssemblyInRange, prevAssemblyInRange);
  waitingAssembly.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return kantoRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isKantoWaitingOnAssembly(r);
    }).length;
  });

  // 2. Waiting on Process
  const waitingProcessOrders = kantoRecords.filter(isKantoWaitingOnProcess);
  const waitingProcessTotalAmt = waitingProcessOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );

  let overdueCount = 0;
  let withinDueCount = 0;
  waitingProcessOrders.forEach((r) => {
    const dueDate = getKantoAssemblingDueDate(r);
    if (dueDate) {
      if (isKantoDueDateOverdue(dueDate, cfg.now)) {
        overdueCount++;
      } else {
        withinDueCount++;
      }
    } else {
      withinDueCount++;
    }
  });

  const waitingProcess = mk(
    {
      key: "kanto_waiting_process",
      label: "Waiting on Process",
      definition:
        'In "Kanto" sheet, "Status" does not have "Processed/Fulfilled", "Cancelled", "Delivered", or "Dispatched". Evaluated against "Assembling Due Date" into Overdue and Within Due Date.',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  waitingProcess.available = true;
  waitingProcess.value = waitingProcessOrders.length;
  waitingProcess.totalAmount = waitingProcessTotalAmt;
  waitingProcess.overdueCount = overdueCount;
  waitingProcess.withinDueCount = withinDueCount;
  const curProcessInRange = kantoRecords.filter(
    (r) => isMonthlyReceived(r, range, cfg.now) && isKantoWaitingOnProcess(r)
  ).length;
  const prevProcessInRange = kantoRecords.filter(
    (r) => isMonthlyReceived(r, prev, cfg.now) && isKantoWaitingOnProcess(r)
  ).length;
  waitingProcess.previous = prevProcessInRange;
  waitingProcess.deltaPct = pctDelta(curProcessInRange, prevProcessInRange);
  waitingProcess.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return kantoRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isKantoWaitingOnProcess(r);
    }).length;
  });

  // 3. Dispatched
  const dispatchedOrders = kantoRecords.filter(isKantoDispatched);
  const dispatchedTotalAmt = dispatchedOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const dispatched = mk(
    {
      key: "kanto_dispatched",
      label: "Dispatched",
      definition: 'In "Kanto" sheet, "Status" has value "Dispatched" or "Delivered".',
      requires: [],
      unit: "count",
      good: "up",
    },
    cfg
  );
  dispatched.available = true;
  dispatched.value = dispatchedOrders.length;
  dispatched.totalAmount = dispatchedTotalAmt;
  const curDispInRange = kantoRecords.filter(
    (r) => isMonthlyReceived(r, range, cfg.now) && isKantoDispatched(r)
  ).length;
  const prevDispInRange = kantoRecords.filter(
    (r) => isMonthlyReceived(r, prev, cfg.now) && isKantoDispatched(r)
  ).length;
  dispatched.previous = prevDispInRange;
  dispatched.deltaPct = pctDelta(curDispInRange, prevDispInRange);
  dispatched.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return kantoRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isKantoDispatched(r);
    }).length;
  });

  return [waitingAssembly, waitingProcess, dispatched];
}

export function computeUnboxedKpis(
  records: OpsRecord[],
  range: DateRange,
  cfg: MetricsConfig,
): Kpi[] {
  const unboxedRecords = records.filter(isUnboxedRecord);
  const prev = previousRange(range);
  const starts = bucketStarts(range);
  const step = granularityFor(range) === "day" ? DAY : 7 * DAY;

  // 1. Waiting on Confirmation (Availability is blank within selected period)
  const waitingConfOrders = unboxedRecords.filter((r) =>
    isUnboxedWaitingOnConfirmation(r, range, cfg.now)
  );
  const waitingConfTotalAmt = waitingConfOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const waitingConfirmation = mk(
    {
      key: "unboxed_waiting_confirmation",
      label: "Waiting on Confirmation",
      definition:
        'In "Unboxed v2" sheet within selected period, "Availability " column is Blank.',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  waitingConfirmation.available = true;
  waitingConfirmation.value = waitingConfOrders.length;
  waitingConfirmation.totalAmount = waitingConfTotalAmt;

  const prevConfInRange = unboxedRecords.filter((r) =>
    isUnboxedWaitingOnConfirmation(r, prev, cfg.now)
  ).length;
  waitingConfirmation.previous = prevConfInRange;
  waitingConfirmation.deltaPct = pctDelta(waitingConfirmation.value, prevConfInRange);
  waitingConfirmation.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return unboxedRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return (
        !Number.isNaN(t) &&
        t >= lo &&
        t < hi &&
        isUnboxedWaitingOnConfirmation(r)
      );
    }).length;
  });

  // 2. Waiting on Process (Availability is "Yes", Status is not "Processed" and does not contain "Cancelled" within selected period)
  const waitingProcOrders = unboxedRecords.filter((r) =>
    isUnboxedWaitingOnProcess(r, range, cfg.now)
  );
  const waitingProcTotalAmt = waitingProcOrders.reduce(
    (sum, r) => sum + (getRecordAmount(r) ?? 0),
    0
  );
  const waitingProcess = mk(
    {
      key: "unboxed_waiting_process",
      label: "Waiting on Process",
      definition:
        'In "Unboxed v2" sheet within selected period, "Availability " column has value "Yes", "Status" column is not equal to "Processed", and does not contain "Cancelled".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg
  );
  waitingProcess.available = true;
  waitingProcess.value = waitingProcOrders.length;
  waitingProcess.totalAmount = waitingProcTotalAmt;

  const prevProcInRange = unboxedRecords.filter((r) =>
    isUnboxedWaitingOnProcess(r, prev, cfg.now)
  ).length;
  waitingProcess.previous = prevProcInRange;
  waitingProcess.deltaPct = pctDelta(waitingProcess.value, prevProcInRange);
  waitingProcess.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return unboxedRecords.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return (
        !Number.isNaN(t) &&
        t >= lo &&
        t < hi &&
        isUnboxedWaitingOnProcess(r)
      );
    }).length;
  });

  return [waitingConfirmation, waitingProcess];
}

// ----------------------------------------------------------------------------- trend

export interface TrendPoint {
  /** bucket start, ISO */
  t: string;
  created: number;
  resolved: number;
  /** Open items at the END of the bucket; null when created+resolved dates are not both mapped. */
  backlog: number | null;
}

export type Granularity = "day" | "week";

export const granularityFor = (range: DateRange): Granularity => ((range.to.getTime() - range.from.getTime()) / DAY > 62 ? "week" : "day");

function startOfUtcWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(x.getTime() - dow * DAY);
}

export function bucketStarts(range: DateRange): Date[] {
  const g = granularityFor(range);
  const step = g === "day" ? DAY : 7 * DAY;
  let cur = g === "day" ? new Date(range.from) : startOfUtcWeek(range.from);
  const out: Date[] = [];
  while (cur.getTime() < range.to.getTime() && out.length < 400) {
    out.push(cur);
    cur = new Date(cur.getTime() + step);
  }
  return out;
}

function lowerCount(sorted: number[], t: number): number {
  // number of values <= t
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function backlogAt(records: OpsRecord[], t: number): number {
  const created = records.map((r) => ms(r.createdAt)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  const resolved = records.filter((r) => r.createdAt).map((r) => ms(r.resolvedAt)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  return Math.max(0, lowerCount(created, t - 1) - lowerCount(resolved, t - 1));
}

export function buildTrend(records: OpsRecord[], range: DateRange, cfg: MetricsConfig): TrendPoint[] {
  const starts = bucketStarts(range);
  if (!starts.length) return [];
  const step = granularityFor(range) === "day" ? DAY : 7 * DAY;
  const wantBacklog = cfg.mapped.has("createdAt") && cfg.mapped.has("resolvedAt");

  const created = records.map((r) => ms(r.createdAt)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  const resolved = records.map((r) => ms(r.resolvedAt)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  const createdForBacklog = created;
  const resolvedForBacklog = records.filter((r) => r.createdAt).map((r) => ms(r.resolvedAt)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);

  return starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    const inBucket = (arr: number[]) => lowerCount(arr, hi - 1) - lowerCount(arr, lo - 1);
    const end = hi - 1;
    return {
      t: s.toISOString(),
      created: cfg.mapped.has("createdAt") ? inBucket(created) : 0,
      resolved: cfg.mapped.has("resolvedAt") ? inBucket(resolved) : 0,
      backlog: wantBacklog ? Math.max(0, lowerCount(createdForBacklog, end) - lowerCount(resolvedForBacklog, end)) : null,
    };
  });
}

// ----------------------------------------------------------------------------- breakdowns

export interface BreakdownRow {
  label: string;
  total: number;
  open: number | null;
  overdue: number | null;
  /** On-time % among resolved-with-due-date records in range; null when not computable. */
  onTimePct: number | null;
}

type Dim = "status" | "priority" | "category" | "team" | "assignee";

export function breakdownBy(records: OpsRecord[], dim: Dim, range: DateRange, cfg: MetricsConfig, topN = 8): BreakdownRow[] | null {
  if (!cfg.mapped.has(dim)) return null;
  const scoped = cfg.mapped.has("createdAt") ? records.filter((r) => within(r.createdAt, range)) : records;
  const completion = hasCompletionInfo(cfg);
  const groups = new Map<string, OpsRecord[]>();
  for (const r of scoped) {
    const key = r[dim] ?? "(blank)";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const rowFor = (label: string, recs: OpsRecord[]): BreakdownRow => {
    const resolvedDue = cfg.mapped.has("resolvedAt") && cfg.mapped.has("dueAt")
      ? recs.filter((r) => within(r.resolvedAt, range) && r.dueAt)
      : [];
    return {
      label,
      total: recs.length,
      open: completion ? recs.filter((r) => !isComplete(r, cfg)).length : null,
      overdue: completion && cfg.mapped.has("dueAt") ? recs.filter((r) => isOverdue(r, cfg)).length : null,
      onTimePct: resolvedDue.length ? (resolvedDue.filter((r) => ms(r.resolvedAt) <= ms(r.dueAt)).length / resolvedDue.length) * 100 : null,
    };
  };
  const rows = [...groups.entries()].map(([label, recs]) => rowFor(label, recs)).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  if (rows.length <= topN) return rows;
  const head = rows.slice(0, topN);
  const tail = [...groups.entries()].filter(([l]) => !head.some((h) => h.label === l)).flatMap(([, recs]) => recs);
  return [...head, rowFor(`Other (${rows.length - topN})`, tail)];
}

// ----------------------------------------------------------------------------- distributions

export interface Bin {
  label: string;
  count: number;
}

const AGE_BINS: [string, number, number][] = [
  ["< 1 day", 0, 1],
  ["1–3 days", 1, 3],
  ["3–7 days", 3, 7],
  ["1–2 weeks", 7, 14],
  ["2–4 weeks", 14, 30],
  ["> 30 days", 30, Infinity],
];

/** Age of OPEN items right now. Requires created date + completion info. */
export function ageingBins(records: OpsRecord[], cfg: MetricsConfig): { bins: Bin[]; overThreshold: number } | null {
  if (!cfg.mapped.has("createdAt") || !hasCompletionInfo(cfg)) return null;
  const bins = AGE_BINS.map(([label]) => ({ label, count: 0 }));
  let over = 0;
  for (const r of records) {
    if (isComplete(r, cfg) || !r.createdAt) continue;
    const days = Math.max(0, (cfg.now.getTime() - ms(r.createdAt)) / DAY);
    const i = AGE_BINS.findIndex(([, lo, hi]) => days >= lo && days < hi);
    if (i >= 0) bins[i].count++;
    if (days > cfg.ageingDays) over++;
  }
  return { bins, overThreshold: over };
}

const TTR_BINS: [string, number, number][] = [
  ["< 1 h", 0, 1],
  ["1–4 h", 1, 4],
  ["4–24 h", 4, 24],
  ["1–3 days", 24, 72],
  ["3–7 days", 72, 168],
  ["> 7 days", 168, Infinity],
];

export function resolutionBins(records: OpsRecord[], range: DateRange, cfg: MetricsConfig): Bin[] | null {
  if (!cfg.mapped.has("createdAt") || !cfg.mapped.has("resolvedAt")) return null;
  const bins = TTR_BINS.map(([label]) => ({ label, count: 0 }));
  for (const r of records) {
    if (!within(r.resolvedAt, range) || !r.createdAt) continue;
    const h = (ms(r.resolvedAt) - ms(r.createdAt)) / HOUR;
    if (h < 0) continue;
    const i = TTR_BINS.findIndex(([, lo, hi]) => h >= lo && h < hi);
    if (i >= 0) bins[i].count++;
  }
  return bins;
}

// ----------------------------------------------------------------------------- attention list

export interface AttentionItem {
  record: OpsRecord;
  reason: "overdue" | "ageing";
  /** Hours past due (overdue) or days old (ageing). */
  magnitude: number;
}

export function needsAttention(records: OpsRecord[], cfg: MetricsConfig, limit = 8): AttentionItem[] {
  if (!hasCompletionInfo(cfg)) return [];
  const items: AttentionItem[] = [];
  for (const r of records) {
    if (isComplete(r, cfg)) continue;
    if (cfg.mapped.has("dueAt") && isOverdue(r, cfg)) {
      items.push({ record: r, reason: "overdue", magnitude: (cfg.now.getTime() - ms(r.dueAt)) / HOUR });
    } else if (cfg.mapped.has("createdAt") && r.createdAt) {
      const days = (cfg.now.getTime() - ms(r.createdAt)) / DAY;
      if (days > cfg.ageingDays) items.push({ record: r, reason: "ageing", magnitude: days });
    }
  }
  const rank = (i: AttentionItem) => (i.reason === "overdue" ? 1e9 : 0) + i.magnitude;
  return items.sort((a, b) => rank(b) - rank(a)).slice(0, limit);
}
