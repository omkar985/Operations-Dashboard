import { describe, it, expect } from "vitest";
import { queryRecords, toCsv, distinctValues } from "@/lib/metrics/records-query";
import type { OpsRecord } from "@/types/operations";
import type { MetricsConfig } from "@/lib/metrics/compute";

describe("Records Query & CSV Export", () => {
  const now = new Date("2026-10-29T12:00:00.000Z");

  const config: MetricsConfig = {
    mapped: new Set(["id", "title", "status", "priority", "team", "createdAt", "dueAt"]),
    completedStatuses: ["Resolved", "Closed"],
    slaTargetPercent: 90,
    ageingDays: 7,
    now,
  };

  const records: OpsRecord[] = [
    {
      row: 2,
      id: "TICK-001",
      title: "Fix payment gateway timeout",
      status: "In Progress",
      priority: "URGENT",
      category: "Billing",
      team: "Payments",
      assignee: "Alice",
      createdAt: "2026-10-20T08:00:00.000Z",
      dueAt: "2026-10-22T08:00:00.000Z", // overdue
      resolvedAt: null,
    },
    {
      row: 3,
      id: "TICK-002",
      title: "Update database indexes",
      status: "Resolved",
      priority: "MEDIUM",
      category: "Database",
      team: "Infra",
      assignee: "Bob",
      createdAt: "2026-10-18T08:00:00.000Z",
      dueAt: "2026-10-25T08:00:00.000Z",
      resolvedAt: "2026-10-21T08:00:00.000Z",
    },
    {
      row: 4,
      id: "TICK-003",
      title: "Design login authentication UI",
      status: "Open",
      priority: "LOW",
      category: "Frontend",
      team: "Design",
      assignee: "Charlie",
      createdAt: "2026-10-25T08:00:00.000Z",
      dueAt: "2026-10-30T08:00:00.000Z",
      resolvedAt: null,
    },
    {
      row: 5,
      id: "TICK-004",
      title: "Refactor cache layers",
      status: "Open",
      priority: "MEDIUM",
      category: "Backend",
      team: "Infra",
      assignee: "Dave",
      createdAt: "2026-10-26T08:00:00.000Z",
      dueAt: "2026-10-31T08:00:00.000Z",
      resolvedAt: null,
    },
    {
      row: 6,
      id: "TICK-005",
      title: "Audit security headers",
      status: "Open",
      priority: "HIGH",
      category: "Security",
      team: "SecOps",
      assignee: "Eve",
      createdAt: "2026-10-27T08:00:00.000Z",
      dueAt: "2026-11-01T08:00:00.000Z",
      resolvedAt: null,
    },
    {
      row: 7,
      id: "TICK-006",
      title: "Provision load balancers",
      status: "Resolved",
      priority: "HIGH",
      category: "Infra",
      team: "Infra",
      assignee: "Alice",
      createdAt: "2026-10-28T08:00:00.000Z",
      dueAt: "2026-10-29T08:00:00.000Z",
      resolvedAt: "2026-10-28T18:00:00.000Z",
    },
  ];

  it("filters by search term across multiple fields", () => {
    const res = queryRecords(records, { q: "payment" }, config);
    expect(res.total).toBe(1);
    expect(res.rows[0].id).toBe("TICK-001");
  });

  it("filters by status and priority", () => {
    const res = queryRecords(records, { status: "Resolved" }, config);
    expect(res.total).toBe(2);

    const urgentRes = queryRecords(records, { priority: "URGENT" }, config);
    expect(urgentRes.total).toBe(1);
    expect(urgentRes.rows[0].id).toBe("TICK-001");
  });

  it("filters for overdue records correctly", () => {
    const res = queryRecords(records, { state: "overdue" }, config);
    expect(res.total).toBe(1);
    expect(res.rows[0].id).toBe("TICK-001");
  });

  it("paginates and sorts records with minimum bounds", () => {
    // 6 records with pageSize: 5 yields page 1 (5 items) and pageCount 2
    const res = queryRecords(records, { pageSize: 5, page: 1, sort: "id", dir: "asc" }, config);
    expect(res.rows.length).toBe(5);
    expect(res.page).toBe(1);
    expect(res.pageCount).toBe(2);
    expect(res.rows[0].id).toBe("TICK-001");
  });

  it("extracts distinct filter values", () => {
    const teams = distinctValues(records, "team");
    expect(teams).toEqual(["Design", "Infra", "Payments", "SecOps"]);
  });

  it("escapes CSV injection vectors (=, +, -, @)", () => {
    const dangerousRecord: OpsRecord = {
      row: 8,
      id: "TICK-MAL",
      title: "=cmd|' /C calc'!A0",
      status: "@dangerous",
      priority: "+12345",
      category: "-secret",
      team: "Safe",
      assignee: "User",
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
    };

    const csv = toCsv([dangerousRecord]);
    expect(csv).toContain("row,id,title");
    expect(csv).toContain("'=cmd|' /C calc'!A0");
    expect(csv).toContain("'@dangerous");
    expect(csv).toContain("'+12345");
    expect(csv).toContain("'-secret");
  });
});
