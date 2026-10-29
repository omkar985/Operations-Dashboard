import type { DateRange } from "@/lib/metrics/compute";

export const RANGE_PRESETS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "365d", label: "12 months", days: 365 },
] as const;

export interface ParsedRange extends DateRange {
  key: string;
  label: string;
  days: number;
  /** YYYY-MM-DD values for inputs (inclusive last day). */
  fromInput: string;
  toInput: string;
}

const DAY = 86_400_000;
const MAX_DAYS = 731;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const fmt = (d: Date) => d.toISOString().slice(0, 10);

function parseDay(s: string | undefined): Date | null {
  if (!s || !ISO_DAY.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || fmt(d) !== s ? null : d;
}

/**
 * Resolves `?range=30d` or `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` into a [from, to) UTC window.
 * Invalid input falls back to the default preset; custom ranges are clamped to 2 years.
 */
export function parseRange(params: { range?: string; from?: string; to?: string }, now: Date, defaultKey = "30d"): ParsedRange {
  const today = startOfUtcDay(now);
  const endExclusive = new Date(today.getTime() + DAY);

  if (params.range === "custom") {
    const from = parseDay(params.from);
    const to = parseDay(params.to);
    if (from && to && from.getTime() <= to.getTime()) {
      const clampedFrom = new Date(Math.max(from.getTime(), to.getTime() - (MAX_DAYS - 1) * DAY));
      const toEx = new Date(to.getTime() + DAY);
      const days = Math.round((toEx.getTime() - clampedFrom.getTime()) / DAY);
      return { key: "custom", label: `${fmt(clampedFrom)} → ${fmt(to)}`, days, from: clampedFrom, to: toEx, fromInput: fmt(clampedFrom), toInput: fmt(to) };
    }
  }
  const preset = RANGE_PRESETS.find((p) => p.key === params.range) ?? RANGE_PRESETS.find((p) => p.key === defaultKey)!;
  const from = new Date(endExclusive.getTime() - preset.days * DAY);
  return { key: preset.key, label: `Last ${preset.label}`, days: preset.days, from, to: endExclusive, fromInput: fmt(from), toInput: fmt(today) };
}
