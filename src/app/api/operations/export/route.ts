import { NextResponse } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getDataset } from "@/server/services/dataset-service";
import { getThresholds } from "@/server/services/settings-service";
import { filterRecords, toCsv, SORT_KEYS, type RecordQuery, type SortKey } from "@/lib/metrics/records-query";
import { parseRange } from "@/lib/metrics/range";
import type { MetricsConfig } from "@/lib/metrics/compute";
import type { FieldKey } from "@/types/operations";
import { AppError } from "@/lib/errors";

const STATES = ["all", "open", "closed", "overdue"] as const;

/** CSV export of exactly what the Operations table shows for the same query string. */
export const GET = apiRoute({ auth: "user" }, async ({ req }) => {
  const data = await getDataset();
  if (data.kind !== "ready") throw new AppError("SOURCE_NOT_CONFIGURED", "No data is available to export yet.");
  const sp = req.nextUrl.searchParams;
  const thresholds = await getThresholds();
  const now = new Date();
  const cfg: MetricsConfig = {
    mapped: new Set(Object.keys(data.mapping.columns) as FieldKey[]),
    completedStatuses: data.mapping.completedStatuses,
    slaTargetPercent: thresholds.slaTargetPercent,
    ageingDays: thresholds.ageingDays,
    now,
  };
  const stateParam = sp.get("state");
  const query: RecordQuery = {
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    priority: sp.get("priority") ?? undefined,
    category: sp.get("category") ?? undefined,
    team: sp.get("team") ?? undefined,
    assignee: sp.get("assignee") ?? undefined,
    state: (STATES as readonly string[]).includes(stateParam ?? "") ? (stateParam as RecordQuery["state"]) : "all",
    sort: SORT_KEYS.includes(sp.get("sort") as SortKey) ? (sp.get("sort") as SortKey) : "row",
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
    range: sp.get("range") ? parseRange({ range: sp.get("range") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, now) : null,
  };
  const rows = filterRecords(data.records, query, cfg);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="operations-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
