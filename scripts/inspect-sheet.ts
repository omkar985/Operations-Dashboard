try {
  process.loadEnvFile?.(".env.local");
  process.loadEnvFile?.();
} catch {}

import { getSheetsConfig } from "../src/lib/env";
import { getSpreadsheetInfo, readRows } from "../src/server/integrations/google-sheets";
import { suggestColumns, toText } from "../src/lib/google-sheets/mapping";

async function main() {
  const sheetsConfig = getSheetsConfig();
  if (!sheetsConfig) {
    console.error("Missing Google Sheets configuration in environment.");
    console.error("Required: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_SHEETS_SPREADSHEET_ID");
    process.exit(1);
  }

  console.log(`Connecting to Google Sheets (ID: ${sheetsConfig.spreadsheetId})...`);
  const info = await getSpreadsheetInfo();

  console.log(`\nSpreadsheet Title: "${info.title}"`);
  console.log(`Worksheets (${info.worksheets.length} total):`);
  info.worksheets.forEach((ws, idx) => {
    console.log(`  [${idx + 1}] "${ws.title}" (${ws.rowCount.toLocaleString()} rows, ${ws.columnCount} cols)`);
  });

  const targetWorksheetName = process.argv[2] || info.worksheets[0]?.title;
  const headerRow = parseInt(process.argv[3] || "1", 10);

  const ws = info.worksheets.find((w) => w.title === targetWorksheetName);
  if (!ws) {
    console.error(`\nWorksheet "${targetWorksheetName}" not found.`);
    process.exit(1);
  }

  console.log(`\nInspecting headers in "${ws.title}" at row ${headerRow}...`);
  const topRows = await readRows(ws, headerRow, headerRow + 3);
  const rawHeaders = topRows[0] || [];
  const headers = rawHeaders.map((h) => toText(h)).filter((h): h is string => h !== null);

  console.log(`Discovered Headers (${headers.length}):`);
  headers.forEach((h, i) => {
    console.log(`  Column ${i + 1}: "${h}"`);
  });

  console.log(`\nAuto-Mapping Suggestions:`);
  const suggestions = suggestColumns(rawHeaders);
  Object.entries(suggestions).forEach(([key, col]) => {
    console.log(`  ${key.padEnd(12)} -> "${col}"`);
  });

  console.log("\nSample Data (First 2 records):");
  topRows.slice(1).forEach((row, i) => {
    console.log(`  Row ${i + 1}:`, row.slice(0, 6));
  });

  console.log("\n✓ Connection and inspection verified successfully.");
}

main().catch((err) => {
  console.error("Error inspecting sheet:", err);
  process.exit(1);
});
