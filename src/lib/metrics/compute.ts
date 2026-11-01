import type { FieldKey, OpsRecord } from "@/types/operations";
import { getRecordCol, getRecordStatus, parseSheetDate } from "@/lib/google-sheets/mapping";

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

/** Checks if a record belongs to the Above 50k Orders subsheet. */
export function isAbove50kRecord(r: OpsRecord): boolean {
  return !isVModaRecord(r);
}

/**
 * Filter 1: Not Yet Processed
 * Criteria: "Action taken" is Blank AND status does not contain "cancelled"
 */
export function isNotYetProcessed(r: OpsRecord): boolean {
  const actionTaken = getRecordCol(r, "Action taken");
  const isActionBlank = !actionTaken || actionTaken.trim() === "";
  const status = getRecordStatus(r).toLowerCase();
  const notCancelled = !status.includes("cancel");
  return isActionBlank && notCancelled;
}

/**
 * Filter 2: Not Yet Delivered
 * Criteria: "Delivered yes/no)" column is not set to "Yes" AND "status" column does not contain "Delivered", "RTO", or "Returns"
 */
export function isNotYetDelivered(r: OpsRecord): boolean {
  const delivered = getRecordCol(r, "Delivered yes/no)");
  const isDeliveredNotYes = (delivered ?? "").trim().toLowerCase() !== "yes";
  const status = getRecordStatus(r).toLowerCase();
  const notDeliveredOrRtoOrReturns = !/delivered|rto|return/i.test(status);
  return isDeliveredNotYes && notDeliveredOrRtoOrReturns;
}

/**
 * V-MODA Filter 1: Waiting on Customer
 * Criteria: Status column contains "Waiting on Customer"
 */
export function isWaitingOnCustomer(r: OpsRecord): boolean {
  const status = (getRecordCol(r, "Status") ?? getRecordStatus(r)).toLowerCase().trim();
  return status.includes("waiting on customer");
}

/**
 * V-MODA Filter 2: Waiting on Logo
 * Criteria: Status column contains "Waiting on Logo"
 */
export function isWaitingOnLogo(r: OpsRecord): boolean {
  const status = (getRecordCol(r, "Status") ?? getRecordStatus(r)).toLowerCase().trim();
  return status.includes("waiting on logo");
}

/**
 * V-MODA Filter 3: Waiting on Engraving
 * Criteria: Status column contains "Waiting on Engraving"
 */
export function isWaitingOnEngraving(r: OpsRecord): boolean {
  const status = (getRecordCol(r, "Status") ?? getRecordStatus(r)).toLowerCase().trim();
  return status.includes("waiting on engraving");
}

/** Extracts and normalizes the order date from record createdAt or raw columns. */
export function getRecordOrderDate(r: OpsRecord): Date | null {
  if (r.createdAt) {
    const d = new Date(r.createdAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const rawDate =
    getRecordCol(r, "Date and time stamp") ??
    getRecordCol(r, "Date and timestamp") ??
    getRecordCol(r, "Order Date") ??
    getRecordCol(r, "Date") ??
    getRecordCol(r, "created");
  if (!rawDate) return null;
  const iso =
    parseSheetDate(rawDate, "ISO") ??
    parseSheetDate(rawDate, "DMY") ??
    parseSheetDate(rawDate, "MDY");
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const direct = new Date(rawDate);
  if (!Number.isNaN(direct.getTime())) return direct;
  return null;
}

/** Extracts the numeric order amount (e.g. from Amt or Amount). */
export function getRecordAmount(r: OpsRecord): number | null {
  const rawAmt = getRecordCol(r, "Amt") ?? getRecordCol(r, "Amount") ?? getRecordCol(r, "Total");
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
  if (!d) return true; // Include if date unmapped or row is in Above 50k tab
  if (range) {
    const t = d.getTime();
    return t >= range.from.getTime() && t < range.to.getTime();
  }
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

const within = (iso: string | null, range: DateRange) => {
  const t = ms(iso);
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
      definition: "Total high-value orders (Above ₹50,000) received in the active monthly cycle.",
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
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi;
    }).length;
  });

  // 2. Pending Processing (Requested KPI: Not Yet Processed - renamed professionally)
  const pendingProcessingOrders = records.filter(isNotYetProcessed);
  const pendingProcessingTotalAmt = pendingProcessingOrders.reduce((sum, r) => sum + (getRecordAmount(r) ?? 0), 0);

  const notYetProcessed = mk(
    {
      key: "not_yet_processed",
      label: "Pending Processing",
      definition: 'Orders where "Action taken" is blank and status does not contain "cancelled".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg,
  );
  notYetProcessed.available = true;
  notYetProcessed.value = pendingProcessingOrders.length;
  notYetProcessed.totalAmount = pendingProcessingTotalAmt;

  const curProcInRange = records.filter((r) => isMonthlyReceived(r, range, cfg.now) && isNotYetProcessed(r)).length;
  const prevProcInRange = records.filter((r) => isMonthlyReceived(r, prev, cfg.now) && isNotYetProcessed(r)).length;
  notYetProcessed.previous = prevProcInRange;
  notYetProcessed.deltaPct = pctDelta(curProcInRange, prevProcInRange);
  notYetProcessed.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return records.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isNotYetProcessed(r);
    }).length;
  });

  // 3. Pending Delivery (Requested KPI: Not Yet Delivered - renamed professionally)
  const pendingDeliveryOrders = records.filter(isNotYetDelivered);
  const pendingDeliveryTotalAmt = pendingDeliveryOrders.reduce((sum, r) => sum + (getRecordAmount(r) ?? 0), 0);

  const notYetDelivered = mk(
    {
      key: "not_yet_delivered",
      label: "Pending Delivery",
      definition: 'Orders where "Delivered yes/no)" is not "Yes" and status does not contain "Delivered", "RTO", or "Returns".',
      requires: [],
      unit: "count",
      good: "down",
    },
    cfg,
  );
  notYetDelivered.available = true;
  notYetDelivered.value = pendingDeliveryOrders.length;
  notYetDelivered.totalAmount = pendingDeliveryTotalAmt;

  const curDelivInRange = records.filter((r) => isMonthlyReceived(r, range, cfg.now) && isNotYetDelivered(r)).length;
  const prevDelivInRange = records.filter((r) => isMonthlyReceived(r, prev, cfg.now) && isNotYetDelivered(r)).length;
  notYetDelivered.previous = prevDelivInRange;
  notYetDelivered.deltaPct = pctDelta(curDelivInRange, prevDelivInRange);
  notYetDelivered.sparkline = starts.map((s) => {
    const lo = Math.max(s.getTime(), range.from.getTime());
    const hi = Math.min(s.getTime() + step, range.to.getTime());
    return records.filter((r) => {
      const d = getRecordOrderDate(r);
      const t = d ? d.getTime() : ms(r.createdAt);
      return !Number.isNaN(t) && t >= lo && t < hi && isNotYetDelivered(r);
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
      definition: 'V-MODA custom engraving orders where status is "Waiting on Customer".',
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
      definition: 'V-MODA custom engraving orders where status is "Waiting on Logo".',
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
      definition: 'V-MODA custom engraving orders where status is "Waiting on Engraving".',
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

  return [waitingCustomer, waitingLogo, waitingEngraving];
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
