/**
 * Operational data model.
 *
 * The spreadsheet is the source of truth. These canonical fields are *mapping targets*:
 * an administrator maps each one to an actual column header (or leaves it unmapped).
 * Nothing is invented — a field that is not mapped is `null` on every record, and every
 * metric declares which fields it needs and reports itself unavailable without them.
 */

export const FIELD_KEYS = [
  "id",
  "title",
  "status",
  "priority",
  "category",
  "team",
  "assignee",
  "createdAt",
  "dueAt",
  "resolvedAt",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const DATE_FIELD_KEYS = ["createdAt", "dueAt", "resolvedAt"] as const satisfies readonly FieldKey[];

export const FIELD_META: Record<FieldKey, { label: string; description: string; kind: "text" | "date" }> = {
  id: { label: "Record ID", description: "Unique reference for the item (ticket number, task id…).", kind: "text" },
  title: { label: "Title", description: "Short description or subject.", kind: "text" },
  status: { label: "Status", description: "Workflow state. Combine with “completed statuses” to know what is open.", kind: "text" },
  priority: { label: "Priority", description: "Urgency or severity label.", kind: "text" },
  category: { label: "Category", description: "Type or queue the item belongs to.", kind: "text" },
  team: { label: "Team", description: "Owning team or group.", kind: "text" },
  assignee: { label: "Assignee", description: "Person responsible.", kind: "text" },
  createdAt: { label: "Created at", description: "When the item was raised.", kind: "date" },
  dueAt: { label: "Due at", description: "SLA / due date-time.", kind: "date" },
  resolvedAt: { label: "Resolved at", description: "When the item was completed.", kind: "date" },
};

export type DateFormat = "ISO" | "DMY" | "MDY";

export interface SheetMapping {
  /** Worksheet (tab) title or comma-separated list of titles. */
  worksheet: string;
  /** 1-based row that contains the column headers. */
  headerRow: number;
  /** How to read date text that is not a real spreadsheet date (ambiguous d/m vs m/d). */
  dateFormat: DateFormat;
  /** canonical field -> column header text exactly as it appears in the sheet. */
  columns: Partial<Record<FieldKey, string>>;
  /** Status values (case-insensitive) that mean "done". Used for open/closed when no resolved date exists. */
  completedStatuses: string[];
}

/** Compact normalised record stored in snapshots. Dates are ISO-8601 UTC strings. */
export interface OpsRecord {
  /** 1-based row number in the worksheet, for traceability back to the sheet. */
  row: number;
  /** Originating worksheet tab name (when multiple subsheets are configured). */
  subsheet?: string;
  id: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  category: string | null;
  team: string | null;
  assignee: string | null;
  createdAt: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  /** Preserved raw sheet columns (column header -> cell text) */
  raw?: Record<string, string | null>;
}

export interface SyncWarning {
  code: "INVALID_DATE" | "MISSING_COLUMN" | "DUPLICATE_HEADER" | "ROW_LIMIT" | "NO_MAPPED_VALUES";
  message: string;
  count?: number;
}

export interface Thresholds {
  /** Target share (0-100) of resolved items that meet their due date. */
  slaTargetPercent: number;
  /** Open items older than this many days are flagged as ageing. */
  ageingDays: number;
}

export interface RefreshSettings {
  refreshIntervalSeconds: number;
  cacheTtlSeconds: number;
}

export const SETTING_KEYS = ["sheet_mapping", "thresholds", "refresh"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
