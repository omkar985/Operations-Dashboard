import type { FieldKey, OpsRecord } from "@/types/operations";

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
  if (r.status && cfg.completedStatuses.length) {
    const s = r.status.toLowerCase();
    return cfg.completedStatuses.some((c) => c.toLowerCase() === s);
  }
  return false;
}

export function isOverdue(r: OpsRecord, cfg: MetricsConfig): boolean {
  if (!r.dueAt) return false;
  return !isComplete(r, cfg) && ms(r.dueAt) < cfg.now.getTime();
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

export type KpiKey = "open" | "created" | "resolved" | "overdue" | "sla" | "ttr";
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
}

function mk(partial: Omit<Kpi, "available" | "missing" | "previous" | "deltaPct" | "sparkline" | "value"> & Partial<Kpi>, cfg: MetricsConfig): Kpi {
  const missing = partial.requires.filter((f) => !cfg.mapped.has(f));
  return { value: null, previous: null, deltaPct: null, sparkline: [], available: missing.length === 0, missing, ...partial };
}

const pctDelta = (cur: number | null, prev: number | null) =>
  cur === null || prev === null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100;

export function computeKpis(records: OpsRecord[], range: DateRange, cfg: MetricsConfig): Kpi[] {
  const prev = previousRange(range);
  const completionNeeded: FieldKey[] = cfg.mapped.has("resolvedAt") ? ["resolvedAt"] : ["status"];
  const trend = buildTrend(records, range, cfg);

  // Open now
  const open = mk(
    {
      key: "open",
      label: "Open items",
      definition: cfg.mapped.has("resolvedAt")
        ? "Records with no resolved date (or a completed status) right now."
        : "Records whose status is not one of the configured completed statuses, right now.",
      requires: completionNeeded,
      unit: "count",
      good: "down",
    },
    cfg,
  );
  if (open.available && hasCompletionInfo(cfg)) {
    open.value = records.filter((r) => !isComplete(r, cfg)).length;
    if (cfg.mapped.has("createdAt") && cfg.mapped.has("resolvedAt")) {
      open.previous = backlogAt(records, range.from.getTime());
      open.deltaPct = pctDelta(open.value, open.previous);
      open.sparkline = trend.map((p) => p.backlog ?? 0);
    }
  } else if (open.available) {
    open.available = false;
    open.missing = ["status"];
  }

  const created = mk(
    { key: "created", label: "Created", definition: "Records whose created date falls inside the selected range.", requires: ["createdAt"], unit: "count", good: "down" },
    cfg,
  );
  if (created.available) {
    created.value = records.filter((r) => within(r.createdAt, range)).length;
    created.previous = records.filter((r) => within(r.createdAt, prev)).length;
    created.deltaPct = pctDelta(created.value, created.previous);
    created.sparkline = trend.map((p) => p.created);
  }

  const resolved = mk(
    { key: "resolved", label: "Resolved", definition: "Records whose resolved date falls inside the selected range.", requires: ["resolvedAt"], unit: "count", good: "up" },
    cfg,
  );
  if (resolved.available) {
    resolved.value = records.filter((r) => within(r.resolvedAt, range)).length;
    resolved.previous = records.filter((r) => within(r.resolvedAt, prev)).length;
    resolved.deltaPct = pctDelta(resolved.value, resolved.previous);
    resolved.sparkline = trend.map((p) => p.resolved);
  }

  const overdue = mk(
    { key: "overdue", label: "Overdue now", definition: "Open records whose due date has already passed.", requires: ["dueAt", ...completionNeeded], unit: "count", good: "down" },
    cfg,
  );
  if (overdue.available && hasCompletionInfo(cfg)) overdue.value = records.filter((r) => isOverdue(r, cfg)).length;
  else if (overdue.available) { overdue.available = false; overdue.missing = ["status"]; }

  const sla = mk(
    {
      key: "sla",
      label: "On-time resolution",
      definition: "Of records resolved in the range that have a due date, the share resolved on or before it.",
      requires: ["dueAt", "resolvedAt"],
      unit: "percent",
      good: "up",
      target: cfg.slaTargetPercent,
    },
    cfg,
  );
  if (sla.available) {
    const calc = (rng: DateRange) => {
      const set = records.filter((r) => within(r.resolvedAt, rng) && r.dueAt);
      if (!set.length) return { pct: null as number | null, n: 0 };
      const met = set.filter((r) => ms(r.resolvedAt) <= ms(r.dueAt)).length;
      return { pct: (met / set.length) * 100, n: set.length };
    };
    const cur = calc(range);
    sla.value = cur.pct;
    sla.sample = cur.n;
    sla.previous = calc(prev).pct;
    sla.deltaPct = sla.value !== null && sla.previous !== null ? sla.value - sla.previous : null; // percentage points
  }

  const ttr = mk(
    {
      key: "ttr",
      label: "Median time to resolve",
      definition: "Median of (resolved − created) for records resolved in the range.",
      requires: ["createdAt", "resolvedAt"],
      unit: "hours",
      good: "down",
    },
    cfg,
  );
  if (ttr.available) {
    const durations = (rng: DateRange) =>
      records
        .filter((r) => within(r.resolvedAt, rng) && r.createdAt)
        .map((r) => (ms(r.resolvedAt) - ms(r.createdAt)) / HOUR)
        .filter((h) => h >= 0);
    const cur = durations(range);
    ttr.value = median(cur);
    ttr.sample = cur.length;
    ttr.previous = median(durations(prev));
    ttr.deltaPct = pctDelta(ttr.value, ttr.previous);
  }

  return [open, created, resolved, overdue, sla, ttr];
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
