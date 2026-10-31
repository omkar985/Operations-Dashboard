import { describe, it, expect } from "vitest";
import {
  computeKpis,
  buildTrend,
  breakdownBy,
  ageingBins,
  resolutionBins,
  needsAttention,
  isNotYetProcessed,
  isNotYetDelivered,
  type MetricsConfig,
  type DateRange,
} from "@/lib/metrics/compute";
import type { OpsRecord } from "@/types/operations";

describe("Metrics Pure Function Calculations", () => {
  const now = new Date("2026-10-29T12:00:00.000Z");

  const range: DateRange = {
    from: new Date("2026-10-01T00:00:00.000Z"),
    to: new Date("2026-10-31T00:00:00.000Z"),
  };

  const config: MetricsConfig = {
    mapped: new Set(["id", "title", "status", "priority", "team", "createdAt", "dueAt", "resolvedAt"]),
    completedStatuses: ["Resolved", "Closed"],
    slaTargetPercent: 90,
    ageingDays: 7,
    now,
  };

  const sampleRecords: OpsRecord[] = [
    {
      row: 2,
      id: "REC-1",
      title: "Task 1",
      status: "Resolved",
      priority: "HIGH",
      category: "Infra",
      team: "DevOps",
      assignee: "Alice",
      createdAt: "2026-10-10T10:00:00.000Z",
      dueAt: "2026-10-12T10:00:00.000Z",
      resolvedAt: "2026-10-11T10:00:00.000Z", // resolved on time (1 day)
    },
    {
      row: 3,
      id: "REC-2",
      title: "Task 2",
      status: "Resolved",
      priority: "URGENT",
      category: "App",
      team: "Frontend",
      assignee: "Bob",
      createdAt: "2026-10-12T10:00:00.000Z",
      dueAt: "2026-10-13T10:00:00.000Z",
      resolvedAt: "2026-10-15T10:00:00.000Z", // resolved late (3 days)
    },
    {
      row: 4,
      id: "REC-3",
      title: "Task 3 (Overdue Open)",
      status: "In Progress",
      priority: "URGENT",
      category: "Security",
      team: "SecOps",
      assignee: "Charlie",
      createdAt: "2026-10-15T10:00:00.000Z",
      dueAt: "2026-10-20T10:00:00.000Z", // overdue relative to now
      resolvedAt: null,
    },
    {
      row: 5,
      id: "REC-4",
      title: "Task 4 (Ageing Open)",
      status: "Open",
      priority: "MEDIUM",
      category: "Ops",
      team: "Frontend",
      assignee: "Alice",
      createdAt: "2026-10-01T10:00:00.000Z", // 28 days old (> 7 days ageing threshold)
      dueAt: null,
      resolvedAt: null,
    },
  ];

  it("computes accurate instrument KPIs", () => {
    const kpis = computeKpis(sampleRecords, range, config);

    const notYetProcKpi = kpis.find((k) => k.key === "not_yet_processed");
    expect(notYetProcKpi).toBeDefined();
    expect(notYetProcKpi?.label).toBe("Not Yet Processed");

    const notYetDelivKpi = kpis.find((k) => k.key === "not_yet_delivered");
    expect(notYetDelivKpi).toBeDefined();
    expect(notYetDelivKpi?.label).toBe("Not Yet Delivered");

    const openKpi = kpis.find((k) => k.key === "open");
    expect(openKpi?.value).toBe(2); // REC-3 and REC-4

    // Removed KPI cards should not be in the list
    expect(kpis.find((k) => k.key === "created")).toBeUndefined();
    expect(kpis.find((k) => k.key === "resolved")).toBeUndefined();
    expect(kpis.find((k) => k.key === "overdue")).toBeUndefined();
    expect(kpis.find((k) => k.key === "sla")).toBeUndefined();
    expect(kpis.find((k) => k.key === "ttr")).toBeUndefined();
  });

  it("filters Not Yet Processed accurately based on Action taken blank and status not cancelled", () => {
    const unproc1: OpsRecord = {
      row: 2,
      id: "ORD-1",
      title: "Order 1",
      status: "New",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Action taken": "", status: "New" },
    };
    const unproc2: OpsRecord = {
      row: 3,
      id: "ORD-2",
      title: "Order 2",
      status: "Pending",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Action taken": null, status: "Pending" },
    };
    const cancelled: OpsRecord = {
      row: 4,
      id: "ORD-3",
      title: "Order 3",
      status: "Cancelled",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Action taken": "", status: "Cancelled by Customer" },
    };
    const processed: OpsRecord = {
      row: 5,
      id: "ORD-4",
      title: "Order 4",
      status: "Processing",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Action taken": "Called customer to confirm", status: "Processing" },
    };

    expect(isNotYetProcessed(unproc1)).toBe(true);
    expect(isNotYetProcessed(unproc2)).toBe(true);
    expect(isNotYetProcessed(cancelled)).toBe(false);
    expect(isNotYetProcessed(processed)).toBe(false);
  });

  it("filters Not Yet Delivered accurately based on Delivered yes/no not yes and status not Delivered/RTO/Returns", () => {
    const notDelivered1: OpsRecord = {
      row: 2,
      id: "ORD-1",
      title: "Order 1",
      status: "In Transit",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Delivered yes/no)": "No", status: "In Transit" },
    };
    const notDelivered2: OpsRecord = {
      row: 3,
      id: "ORD-2",
      title: "Order 2",
      status: "Dispatched",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Delivered (yes/no)": "", status: "Dispatched" },
    };
    const alreadyDelivered1: OpsRecord = {
      row: 4,
      id: "ORD-3",
      title: "Order 3",
      status: "Delivered",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Delivered yes/no)": "Yes", status: "Delivered" },
    };
    const alreadyDelivered2: OpsRecord = {
      row: 5,
      id: "ORD-4",
      title: "Order 4",
      status: "Delivered",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Delivered yes/no)": "No", status: "Delivered" },
    };
    const rto: OpsRecord = {
      row: 6,
      id: "ORD-5",
      title: "Order 5",
      status: "RTO Initiated",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Delivered yes/no)": "No", status: "RTO Initiated" },
    };
    const returns: OpsRecord = {
      row: 7,
      id: "ORD-6",
      title: "Order 6",
      status: "Customer Returns",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Delivered yes/no)": "No", status: "Customer Returns" },
    };

    expect(isNotYetDelivered(notDelivered1)).toBe(true);
    expect(isNotYetDelivered(notDelivered2)).toBe(true);
    expect(isNotYetDelivered(alreadyDelivered1)).toBe(false);
    expect(isNotYetDelivered(alreadyDelivered2)).toBe(false);
    expect(isNotYetDelivered(rto)).toBe(false);
    expect(isNotYetDelivered(returns)).toBe(false);
  });

  it("builds daily/weekly trend series without synthetic numbers", () => {
    const trend = buildTrend(sampleRecords, range, config);
    expect(trend.length).toBeGreaterThan(0);

    const totalCreatedInTrend = trend.reduce((sum, p) => sum + p.created, 0);
    expect(totalCreatedInTrend).toBe(4);

    const totalResolvedInTrend = trend.reduce((sum, p) => sum + p.resolved, 0);
    expect(totalResolvedInTrend).toBe(2);
  });

  it("groups records into breakdowns by team with SLA compliance", () => {
    const byTeam = breakdownBy(sampleRecords, "team", range, config);
    expect(byTeam).not.toBeNull();

    const frontendTeam = byTeam?.find((t) => t.label === "Frontend");
    expect(frontendTeam?.total).toBe(2);
    expect(frontendTeam?.open).toBe(1);

    const devopsTeam = byTeam?.find((t) => t.label === "DevOps");
    expect(devopsTeam?.total).toBe(1);
    expect(devopsTeam?.onTimePct).toBe(100);
  });

  it("sorts ageing and overdue items into attention list properly", () => {
    const attention = needsAttention(sampleRecords, config, 10);
    expect(attention.length).toBe(2);

    // Overdue item ranked first
    expect(attention[0].record.id).toBe("REC-3");
    expect(attention[0].reason).toBe("overdue");

    // Ageing item ranked second
    expect(attention[1].record.id).toBe("REC-4");
    expect(attention[1].reason).toBe("ageing");
  });

  it("generates correct ageing bins for open items", () => {
    const ageing = ageingBins(sampleRecords, config);
    expect(ageing).not.toBeNull();
    expect(ageing?.overThreshold).toBe(2); // REC-3 (~9 days) and REC-4 (~28 days) are both > 7 days
  });

  it("calculates resolution time bins for completed items", () => {
    const bins = resolutionBins(sampleRecords, range, config);
    expect(bins).not.toBeNull();
    const totalInBins = bins!.reduce((sum, b) => sum + b.count, 0);
    expect(totalInBins).toBe(2);
  });
});
