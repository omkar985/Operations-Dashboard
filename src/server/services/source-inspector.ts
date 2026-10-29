import "server-only";
import { getSpreadsheetInfo, readRows, type WorksheetInfo } from "@/server/integrations/google-sheets";
import { suggestColumns, toText, type CellValue } from "@/lib/google-sheets/mapping";
import type { FieldKey } from "@/types/operations";

export interface SourceInspection {
  spreadsheetTitle: string;
  worksheets: WorksheetInfo[];
  worksheet?: string;
  headerRow?: number;
  /** Headers exactly as they appear in the sheet (blank header cells omitted). */
  headers?: string[];
  suggestions?: Partial<Record<FieldKey, string>>;
  /** First data rows, raw. Real date cells appear as serial numbers here and are converted during sync. */
  sample?: (string | number | boolean | null)[][];
  rowCount?: number;
}

/** Reads the live spreadsheet structure so the mapping is built from ACTUAL headers, never assumed. */
export async function inspectSource(opts: { worksheet?: string; headerRow?: number }): Promise<SourceInspection> {
  const info = await getSpreadsheetInfo();
  const base: SourceInspection = { spreadsheetTitle: info.title, worksheets: info.worksheets };
  const ws = opts.worksheet ? info.worksheets.find((w) => w.title === opts.worksheet) : undefined;
  if (!ws) return base;

  const headerRow = opts.headerRow ?? 1;
  const top = await readRows(ws, headerRow, headerRow + 5);
  const rawHeaders: CellValue[] = top[0] ?? [];
  const headers = rawHeaders.map((h) => toText(h)).filter((h): h is string => h !== null);
  return {
    ...base,
    worksheet: ws.title,
    headerRow,
    headers,
    suggestions: suggestColumns(rawHeaders),
    sample: top.slice(1).map((r) => rawHeaders.map((_, i) => (r[i] === undefined || r[i] === "" ? null : (r[i] as string | number | boolean)))),
    rowCount: Math.max(0, ws.rowCount - headerRow),
  };
}
