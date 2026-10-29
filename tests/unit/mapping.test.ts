import { describe, it, expect } from "vitest";
import {
  parseSheetDate,
  serialToIso,
  mapRows,
  suggestColumns,
  mappingFingerprint,
} from "@/lib/google-sheets/mapping";
import type { SheetMapping } from "@/types/operations";

describe("Google Sheets Mapping & Parsing", () => {
  it("converts Excel serial day numbers to UTC ISO strings accurately", () => {
    // Excel day 45000 is 2023-03-15
    const iso = serialToIso(45000);
    expect(iso).toBe("2023-03-15T00:00:00.000Z");

    // Excel day with fraction (0.5 = 12:00:00 UTC)
    const isoWithTime = serialToIso(45000.5);
    expect(isoWithTime).toBe("2023-03-15T12:00:00.000Z");
  });

  it("handles dates correctly with epoch alignment", () => {
    const iso = serialToIso(36526); // Jan 1 2000
    expect(iso).toBe("2000-01-01T00:00:00.000Z");
  });

  it("parses ambiguous date text according to format preference", () => {
    // "05/04/2026"
    const dmy = parseSheetDate("05/04/2026", "DMY");
    expect(dmy).toBe("2026-04-05T00:00:00.000Z"); // 5th April

    const mdy = parseSheetDate("05/04/2026", "MDY");
    expect(mdy).toBe("2026-05-04T00:00:00.000Z"); // May 4th
  });

  it("correctly parses ISO date strings regardless of preference", () => {
    const iso = parseSheetDate("2026-10-29T14:30:00Z", "DMY");
    expect(iso).toBe("2026-10-29T14:30:00.000Z");
  });

  it("suggests canonical columns from common header patterns", () => {
    const headers = [
      "Ticket Number",
      "Summary",
      "Status",
      "Severity",
      "Assigned Team",
      "Owner",
      "Date Created",
      "SLA Due",
      "Resolved Date",
    ];

    const suggestions = suggestColumns(headers);
    expect(suggestions.id).toBe("Ticket Number");
    expect(suggestions.title).toBe("Summary");
    expect(suggestions.status).toBe("Status");
    expect(suggestions.priority).toBe("Severity");
    expect(suggestions.team).toBe("Assigned Team");
    expect(suggestions.assignee).toBe("Owner");
    expect(suggestions.createdAt).toBe("Date Created");
    expect(suggestions.dueAt).toBe("SLA Due");
    expect(suggestions.resolvedAt).toBe("Resolved Date");
  });

  it("maps raw spreadsheet rows to typed OpsRecord correctly", () => {
    const headers = ["Ticket ID", "Subject", "Status", "Created At"];
    const mapping: SheetMapping = {
      worksheet: "Operations",
      headerRow: 1,
      dateFormat: "ISO",
      columns: {
        id: "Ticket ID",
        title: "Subject",
        status: "Status",
        createdAt: "Created At",
      },
      completedStatuses: ["Resolved", "Closed"],
    };

    const rows = [
      ["TICK-101", "Production Incident", "Open", "2026-10-29T08:00:00Z"],
    ];

    const result = mapRows(rows, headers, mapping, 2);
    expect(result.records.length).toBe(1);

    const record = result.records[0];
    expect(record.row).toBe(2);
    expect(record.id).toBe("TICK-101");
    expect(record.title).toBe("Production Incident");
    expect(record.status).toBe("Open");
    expect(record.createdAt).toBe("2026-10-29T08:00:00.000Z");
    expect(record.priority).toBeNull();
  });

  it("generates deterministic fingerprints for mapping configurations", () => {
    const mappingA: SheetMapping = {
      worksheet: "Ops",
      headerRow: 1,
      dateFormat: "DMY",
      columns: { id: "ID", status: "Status" },
      completedStatuses: ["Closed"],
    };

    const mappingB: SheetMapping = {
      worksheet: "Ops",
      headerRow: 1,
      dateFormat: "DMY",
      columns: { status: "Status", id: "ID" }, // reversed order
      completedStatuses: ["Closed"],
    };

    expect(mappingFingerprint(mappingA)).toBe(mappingFingerprint(mappingB));
  });
});
