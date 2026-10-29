import "server-only";
import { JWT } from "google-auth-library";
import { getSheetsConfig } from "@/lib/env";
import { log } from "@/lib/logger";
import type { CellValue } from "@/lib/google-sheets/mapping";

/**
 * Server-side Google Sheets client (REST v4, service account, READ-ONLY scope).
 * - Reads only the ranges requested.
 * - Bounded retries with exponential backoff + jitter for 429 / 5xx / network faults.
 * - Typed, user-safe errors (never includes credentials).
 */

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 25_000;

export type SheetsErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH"
  | "NOT_FOUND"
  | "PERMISSION"
  | "RATE_LIMIT"
  | "BAD_RANGE"
  | "UNAVAILABLE";

export class SheetsError extends Error {
  constructor(
    public readonly code: SheetsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SheetsError";
  }
}

let authClient: JWT | undefined;
let authKey = "";

async function accessToken(): Promise<string> {
  const cfg = getSheetsConfig();
  if (!cfg) throw new SheetsError("NOT_CONFIGURED", "Google Sheets credentials are not configured.");
  const key = `${cfg.clientEmail}:${cfg.privateKey.length}`;
  if (!authClient || authKey !== key) {
    authClient = new JWT({ email: cfg.clientEmail, key: cfg.privateKey, scopes: [SCOPE] });
    authKey = key;
  }
  try {
    const { token } = await authClient.getAccessToken();
    if (!token) throw new Error("empty token");
    return token;
  } catch (err) {
    log.warn("sheets_auth_failed", { message: err instanceof Error ? err.message : String(err) });
    throw new SheetsError("AUTH", "Could not authenticate with Google using the configured service account.");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(path: string, params: Record<string, string | string[]> = {}): Promise<T> {
  const cfg = getSheetsConfig();
  if (!cfg) throw new SheetsError("NOT_CONFIGURED", "Google Sheets credentials are not configured.");

  const url = new URL(`${BASE}/${encodeURIComponent(cfg.spreadsheetId)}${path}`);
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, item);
  }

  let lastError: SheetsError | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;

      const detail = await res.json().then((b: { error?: { message?: string } }) => b?.error?.message ?? "").catch(() => "");
      if (res.status === 404) throw new SheetsError("NOT_FOUND", "Spreadsheet not found. Check GOOGLE_SHEETS_SPREADSHEET_ID.");
      if (res.status === 403 || res.status === 401) {
        throw new SheetsError("PERMISSION", `Access denied. Share the spreadsheet (Viewer) with ${cfg.clientEmail} and enable the Google Sheets API.`);
      }
      if (res.status === 400) throw new SheetsError("BAD_RANGE", `Google rejected the request: ${detail.slice(0, 160) || "invalid range"}`);

      if (res.status === 429 || res.status >= 500) {
        lastError = new SheetsError(res.status === 429 ? "RATE_LIMIT" : "UNAVAILABLE", res.status === 429 ? "Google Sheets rate limit reached." : `Google Sheets returned ${res.status}.`);
        const retryAfter = Number(res.headers.get("retry-after"));
        if (attempt < MAX_ATTEMPTS) {
          const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1);
          await sleep(Math.min(backoff, 10_000) + Math.random() * 250);
          continue;
        }
        throw lastError;
      }
      throw new SheetsError("UNAVAILABLE", `Unexpected response from Google Sheets (${res.status}).`);
    } catch (err) {
      if (err instanceof SheetsError) {
        if (err.code === "RATE_LIMIT" || err.code === "UNAVAILABLE") {
          lastError = err;
          if (attempt >= MAX_ATTEMPTS) throw err;
          continue;
        }
        throw err; // auth / not found / permission / bad range are not retryable
      }
      lastError = new SheetsError("UNAVAILABLE", "Network error while contacting Google Sheets.");
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * 2 ** (attempt - 1) + Math.random() * 250);
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new SheetsError("UNAVAILABLE", "Google Sheets is unavailable.");
}

export interface WorksheetInfo {
  title: string;
  rowCount: number;
  columnCount: number;
}
export interface SpreadsheetInfo {
  title: string;
  worksheets: WorksheetInfo[];
}

export async function getSpreadsheetInfo(): Promise<SpreadsheetInfo> {
  const data = await request<{
    properties?: { title?: string };
    sheets?: { properties: { title: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[];
  }>("", { fields: "properties.title,sheets.properties(title,gridProperties(rowCount,columnCount))" });
  return {
    title: data.properties?.title ?? "Spreadsheet",
    worksheets: (data.sheets ?? []).map((s) => ({
      title: s.properties.title,
      rowCount: s.properties.gridProperties?.rowCount ?? 0,
      columnCount: s.properties.gridProperties?.columnCount ?? 0,
    })),
  };
}

/** 1 → A, 27 → AA */
export function columnLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const quoteTitle = (t: string) => `'${t.replace(/'/g, "''")}'`;

interface ValueRange {
  values?: CellValue[][];
}

const RENDER = {
  valueRenderOption: "UNFORMATTED_VALUE",
  dateTimeRenderOption: "SERIAL_NUMBER",
  majorDimension: "ROWS",
};

async function readRange(a1: string): Promise<CellValue[][]> {
  const data = await request<ValueRange>(`/values/${encodeURIComponent(a1)}`, RENDER);
  return data.values ?? [];
}

export async function readRows(ws: WorksheetInfo, firstRow: number, lastRow: number): Promise<CellValue[][]> {
  const cols = Math.max(ws.columnCount, 1);
  const last = Math.min(lastRow, ws.rowCount);
  if (firstRow > last) return [];
  return readRange(`${quoteTitle(ws.title)}!A${firstRow}:${columnLetter(cols)}${last}`);
}

export interface PagedRead {
  headers: CellValue[];
  rows: CellValue[][];
  truncated: boolean;
}

/**
 * Reads the header row and then the data in fixed-size row chunks bounded by the worksheet's grid size
 * (so a blank gap inside the data can never end pagination early).
 */
export async function readWorksheet(ws: WorksheetInfo, headerRow: number, opts: { chunkSize?: number; maxRows?: number } = {}): Promise<PagedRead> {
  const chunk = opts.chunkSize ?? 2000;
  const maxRows = opts.maxRows ?? 100_000;
  const headers = (await readRows(ws, headerRow, headerRow))[0] ?? [];
  const rows: CellValue[][] = [];
  let start = headerRow + 1;
  let truncated = false;
  while (start <= ws.rowCount) {
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    const end = Math.min(start + chunk - 1, ws.rowCount);
    const part = await readRows(ws, start, end);
    // The API trims trailing empty rows; pad so row numbers stay aligned with the sheet.
    for (let i = 0; i < end - start + 1; i++) rows.push(part[i] ?? []);
    start = end + 1;
  }
  return { headers, rows, truncated };
}
