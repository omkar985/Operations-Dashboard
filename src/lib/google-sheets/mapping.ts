import {
  DATE_FIELD_KEYS,
  FIELD_KEYS,
  type DateFormat,
  type FieldKey,
  type OpsRecord,
  type SheetMapping,
  type SyncWarning,
} from "@/types/operations";

/**
 * Pure, side-effect-free mapping from raw worksheet values to typed records.
 * Shared by the sync service, the admin mapping UI (suggestions) and unit tests.
 */

export type CellValue = string | number | boolean | null | undefined;

export const normalizeHeader = (s: unknown): string =>
  String(s ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export function toText(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const t = String(value).replace(/\u00a0/g, " ").trim();
  return t === "" ? null : t;
}

const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Converts a Sheets/Excel serial date number to an ISO string (interpreted as UTC wall time). */
export function serialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 120000) return null;
  const ms = SHEETS_EPOCH_MS + Math.round(serial * 86_400_000 / 1000) * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function buildUtc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string | null {
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const dt = new Date(ms);
  // Reject overflow such as 31 Feb → 3 Mar.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString();
}

function parseTime(rest: string): { h: number; mi: number; s: number } | null | "none" {
  const t = rest.trim();
  if (!t) return "none";
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?$/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  const mer = m[4]?.toLowerCase();
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
  }
  return { h, mi, s };
}

/**
 * Parses a spreadsheet date cell. Real date cells arrive as serial numbers (the Sheets API is
 * called with SERIAL_NUMBER rendering); text dates are interpreted using the configured format.
 * Returns null — never a guess — when the value cannot be parsed unambiguously.
 */
export function parseSheetDate(value: CellValue, format: DateFormat): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return serialToIso(value);
  if (typeof value === "boolean") return null;
  const raw = String(value).replace(/\u00a0/g, " ").trim();
  if (!raw) return null;

  // Pure numeric string => serial number
  if (/^\d{4,6}(\.\d+)?$/.test(raw) && !/^\d{4}$/.test(raw)) return serialToIso(Number(raw));

  // ISO 8601: 2026-10-29, 2026-10-29T14:05:00Z, 2026-10-29 14:05
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](.+?))?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(raw);
  if (m) {
    const time = parseTime((m[4] ?? "").replace(/Z$/i, ""));
    if (time === null) return null;
    const base = buildUtc(+m[1], +m[2], +m[3], time === "none" ? 0 : time.h, time === "none" ? 0 : time.mi, time === "none" ? 0 : time.s);
    if (!base) return null;
    if (m[5] && m[5].toUpperCase() !== "Z") {
      const off = /([+-])(\d{2}):?(\d{2})/.exec(m[5]);
      if (off) {
        const minutes = (+off[2] * 60 + +off[3]) * (off[1] === "-" ? -1 : 1);
        return new Date(new Date(base).getTime() - minutes * 60_000).toISOString();
      }
    }
    return base;
  }

  // 29 Oct 2026 [time] / 29-Oct-2026
  m = /^(\d{1,2})[\s\-/]([A-Za-z]{3,9})[\s\-/,]+(\d{4})(?:[,\s]+(.+))?$/.exec(raw);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    const time = parseTime(m[4] ?? "");
    if (!mo || time === null) return null;
    return buildUtc(+m[3], mo, +m[1], time === "none" ? 0 : time.h, time === "none" ? 0 : time.mi, time === "none" ? 0 : time.s);
  }

  // Oct 29, 2026 [time]
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:[,\s]+(.+))?$/.exec(raw);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 4).toLowerCase()] ?? MONTHS[m[1].slice(0, 3).toLowerCase()];
    const time = parseTime(m[4] ?? "");
    if (!mo || time === null) return null;
    return buildUtc(+m[3], mo, +m[2], time === "none" ? 0 : time.h, time === "none" ? 0 : time.mi, time === "none" ? 0 : time.s);
  }

  // a/b/yyyy [time] with configured order
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:[,\s]+(.+))?$/.exec(raw);
  if (m) {
    if (format === "ISO") return null;
    let year = +m[3];
    if (m[3].length === 2) year += 2000;
    const [d, mo] = format === "DMY" ? [+m[1], +m[2]] : [+m[2], +m[1]];
    const time = parseTime(m[4] ?? "");
    if (time === null) return null;
    return buildUtc(year, mo, d, time === "none" ? 0 : time.h, time === "none" ? 0 : time.mi, time === "none" ? 0 : time.s);
  }

  return null;
}

export interface ResolvedColumns {
  /** canonical field -> zero-based column index in the sheet row */
  indices: Partial<Record<FieldKey, number>>;
  /** mapped headers that could not be found in the sheet */
  missing: { field: FieldKey; header: string }[];
  /** headers that appear more than once (the first occurrence is used) */
  duplicates: string[];
}

export function resolveColumns(headers: CellValue[], columns: SheetMapping["columns"]): ResolvedColumns {
  const normalized = headers.map(normalizeHeader);
  const seen = new Map<string, number>();
  const duplicates = new Set<string>();
  normalized.forEach((h, i) => {
    if (!h) return;
    if (seen.has(h)) duplicates.add(String(headers[i]).trim());
    else seen.set(h, i);
  });

  const indices: ResolvedColumns["indices"] = {};
  const missing: ResolvedColumns["missing"] = [];
  for (const field of FIELD_KEYS) {
    const header = columns[field];
    if (!header) continue;
    const idx = seen.get(normalizeHeader(header));
    if (idx === undefined) missing.push({ field, header });
    else indices[field] = idx;
  }
  return { indices, missing, duplicates: [...duplicates] };
}

export interface MapResult {
  records: OpsRecord[];
  rowsRead: number;
  rowsBlank: number;
  warnings: SyncWarning[];
}

/**
 * Maps raw rows (everything below the header row) to normalised records.
 * `firstDataRow` is the 1-based sheet row number of rows[0].
 */
export function mapRows(
  rows: CellValue[][],
  headers: CellValue[],
  mapping: SheetMapping,
  firstDataRow: number,
): MapResult {
  const { indices, missing, duplicates } = resolveColumns(headers, mapping.columns);
  const warnings: SyncWarning[] = [];

  for (const { field, header } of missing) {
    warnings.push({ code: "MISSING_COLUMN", message: `Column “${header}” (mapped to ${field}) was not found in the worksheet.` });
  }
  for (const d of duplicates) {
    warnings.push({ code: "DUPLICATE_HEADER", message: `Header “${d}” appears more than once; the first column is used.` });
  }

  const invalidDates: Partial<Record<FieldKey, number>> = {};
  const records: OpsRecord[] = [];
  let blank = 0;

  rows.forEach((row, i) => {
    const text = (f: FieldKey) => (indices[f] === undefined ? null : toText(row[indices[f]!]));
    const date = (f: FieldKey) => {
      const idx = indices[f];
      if (idx === undefined) return null;
      const cell = row[idx];
      const had = toText(cell) !== null;
      const iso = parseSheetDate(cell, mapping.dateFormat);
      if (had && iso === null) invalidDates[f] = (invalidDates[f] ?? 0) + 1;
      return iso;
    };

    const rec: OpsRecord = {
      row: firstDataRow + i,
      id: text("id"),
      title: text("title"),
      status: text("status"),
      priority: text("priority"),
      category: text("category"),
      team: text("team"),
      assignee: text("assignee"),
      createdAt: date("createdAt"),
      dueAt: date("dueAt"),
      resolvedAt: date("resolvedAt"),
    };

    const hasAny = FIELD_KEYS.some((k) => {
      const idx = indices[k];
      return idx !== undefined && toText(row[idx]) !== null;
    });
    if (!hasAny) {
      blank++;
      return;
    }
    records.push(rec);
  });

  for (const f of DATE_FIELD_KEYS) {
    const n = invalidDates[f];
    if (n) warnings.push({ code: "INVALID_DATE", count: n, message: `${n} value(s) in “${mapping.columns[f]}” (${f}) are not valid dates and were left empty.` });
  }

  return { records, rowsRead: rows.length, rowsBlank: blank, warnings };
}

/** Stable hash of the mapping, so snapshots can be tied to the configuration that produced them. */
export function mappingFingerprint(mapping: SheetMapping): string {
  const canonical = JSON.stringify({
    w: mapping.worksheet,
    h: mapping.headerRow,
    d: mapping.dateFormat,
    c: Object.fromEntries(Object.entries(mapping.columns).sort(([a], [b]) => a.localeCompare(b))),
    s: [...mapping.completedStatuses].map((s) => s.toLowerCase()).sort(),
  });
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) h = ((h << 5) + h + canonical.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Header aliases used ONLY to pre-fill suggestions in the admin UI. Admins must confirm them. */
const ALIASES: Record<FieldKey, string[]> = {
  id: ["id", "ticket id", "ticket no", "ticket number", "task id", "reference", "ref", "order id", "case id", "#"],
  title: ["title", "subject", "summary", "name", "description", "task", "issue"],
  status: ["status", "state", "stage"],
  priority: ["priority", "severity", "urgency"],
  category: ["category", "type", "queue", "issue type", "department", "group"],
  team: ["team", "squad", "owner team", "assigned team"],
  assignee: ["assignee", "assigned to", "owner", "agent", "handler", "assigned agent"],
  createdAt: ["created", "created at", "created date", "date created", "opened", "opened at", "created on", "created time", "date"],
  dueAt: ["due", "due at", "due date", "sla due", "deadline", "sla deadline", "target date"],
  resolvedAt: ["resolved", "resolved at", "resolved date", "closed", "closed at", "closed date", "completed", "completed at", "done at"],
};

export function suggestColumns(headers: CellValue[]): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  const used = new Set<number>();
  const norm = headers.map(normalizeHeader);
  for (const field of FIELD_KEYS) {
    for (const alias of ALIASES[field]) {
      const idx = norm.findIndex((h, i) => h === alias && !used.has(i));
      if (idx >= 0) {
        out[field] = String(headers[idx]).trim();
        used.add(idx);
        break;
      }
    }
  }
  return out;
}
