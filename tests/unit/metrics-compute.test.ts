import { describe, it, expect } from "vitest";
import {
  computeKpis,
  buildTrend,
  breakdownBy,
  ageingBins,
  resolutionBins,
  needsAttention,
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

    const openKpi = kpis.find((k) => k.key === "open");
    expect(openKpi?.value).toBe(2); // REC-3 and REC-4

    const createdKpi = kpis.find((k) => k.key === "created");
    expect(createdKpi?.value).toBe(4); // all created within range

    const resolvedKpi = kpis.find((k) => k.key === "resolved");
    expect(resolvedKpi?.value).toBe(2); // REC-1 and REC-2

    const overdueKpi = kpis.find((k) => k.key === "overdue");
    expect(overdueKpi?.value).toBe(1); // REC-3

    const slaKpi = kpis.find((k) => k.key === "sla");
    expect(slaKpi?.value).toBe(50); // 1 out of 2 resolved items on time

    const ttrKpi = kpis.find((k) => k.key === "ttr");
    // REC-1: 24h, REC-2: 72h. Median of [24, 72] = 48 hours
    expect(ttrKpi?.value).toBe(48);
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
