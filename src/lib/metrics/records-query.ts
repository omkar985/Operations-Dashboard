import { isComplete, isOverdue, type DateRange, type MetricsConfig } from "@/lib/metrics/compute";
import type { OpsRecord } from "@/types/operations";

/** Server-side search / filter / sort / pagination for the Operations table (pure, unit-tested). */

export type SortKey = "row" | "id" | "title" | "status" | "priority" | "category" | "team" | "assignee" | "createdAt" | "dueAt" | "resolvedAt";

export interface RecordQuery {
  q?: string;
  status?: string;
  priority?: string;
  category?: string;
  team?: string;
  assignee?: string;
  /** all | open | closed | overdue */
  state?: "all" | "open" | "closed" | "overdue";
  sort?: SortKey;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  range?: DateRange | null;
}

export interface RecordPage {
  rows: OpsRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const SORT_KEYS: SortKey[] = ["row", "id", "title", "status", "priority", "category", "team", "assignee", "createdAt", "dueAt", "resolvedAt"];

const cmp = (a: string | number | null, b: string | number | null) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls always last
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
};

export function filterRecords(records: OpsRecord[], query: RecordQuery, cfg: MetricsConfig): OpsRecord[] {
  const q = query.q?.trim().toLowerCase();
  return records.filter((r) => {
    if (query.status && (r.status ?? "(blank)") !== query.status) return false;
    if (query.priority && (r.priority ?? "(blank)") !== query.priority) return false;
    if (query.category && (r.category ?? "(blank)") !== query.category) return false;
    if (query.team && (r.team ?? "(blank)") !== query.team) return false;
    if (query.assignee && (r.assignee ?? "(blank)") !== query.assignee) return false;
    if (query.state === "open" && isComplete(r, cfg)) return false;
    if (query.state === "closed" && !isComplete(r, cfg)) return false;
    if (query.state === "overdue" && !isOverdue(r, cfg)) return false;
    if (query.range && r.createdAt) {
      const t = Date.parse(r.createdAt);
      if (t < query.range.from.getTime() || t >= query.range.to.getTime()) return false;
    } else if (query.range && cfg.mapped.has("createdAt")) {
      return false; // dated filter requested but this record has no created date
    }
    if (q) {
      const hay = `${r.id ?? ""} ${r.title ?? ""} ${r.status ?? ""} ${r.priority ?? ""} ${r.category ?? ""} ${r.team ?? ""} ${r.assignee ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function queryRecords(records: OpsRecord[], query: RecordQuery, cfg: MetricsConfig): RecordPage {
  const filtered = filterRecords(records, query, cfg);
  const sort: SortKey = SORT_KEYS.includes(query.sort as SortKey) ? (query.sort as SortKey) : "row";
  const dir = query.dir === "desc" ? -1 : 1;
  const value = (r: OpsRecord): string | number | null => {
    const v = r[sort];
    if (v === null) return null;
    if (sort === "createdAt" || sort === "dueAt" || sort === "resolvedAt") return Date.parse(v as string);
    return v as string | number;
  };
  const sorted = [...filtered].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    // keep nulls last regardless of direction
    if (av === null || bv === null) return cmp(av, bv);
    return cmp(av, bv) * dir;
  });
  const pageSize = Math.min(Math.max(query.pageSize ?? 25, 5), 200);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);
  return { rows: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageSize, pageCount };
}

export function distinctValues(records: OpsRecord[], field: "status" | "priority" | "category" | "team" | "assignee", limit = 200): string[] {
  const set = new Set<string>();
  for (const r of records) {
    set.add(r[field] ?? "(blank)");
    if (set.size >= limit) break;
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** CSV with spreadsheet-formula injection protection (cells starting with = + - @ are prefixed). */
export function toCsv(records: OpsRecord[]): string {
  const cols: (keyof OpsRecord)[] = ["row", "id", "title", "status", "priority", "category", "team", "assignee", "createdAt", "dueAt", "resolvedAt"];
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...records.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
}
