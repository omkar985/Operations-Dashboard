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
  isMonthlyReceived,
  isVModaRecord,
  isAbove50kRecord,
  isWaitingOnCustomer,
  isWaitingOnLogo,
  isWaitingOnEngraving,
  isPendingOnDispatch,
  computeVModaKpis,
  isDemoRecord,
  isDemoOrderReceivedNotProcessed,
  isDemoProcessedNotDispatched,
  computeDemoKpis,
  isKantoRecord,
  isKantoWaitingOnAssembly,
  isKantoWaitingOnProcess,
  isKantoDispatched,
  getKantoAssemblingDueDate,
  isKantoDueDateOverdue,
  isKantoDueDateWithin,
  computeKantoKpis,
  isUnboxedRecord,
  isUnboxedWaitingOnConfirmation,
  isUnboxedWaitingOnProcess,
  getUnboxedConfirmationDueDate,
  computeUnboxedKpis,
  isHvcRecord,
  isHvcPendingOnAttend,
  computeHvcKpis,
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
    expect(notYetProcKpi?.label).toBe("Pending Processing");

    const notYetDelivKpi = kpis.find((k) => k.key === "not_yet_delivered");
    expect(notYetDelivKpi).toBeDefined();
    expect(notYetDelivKpi?.label).toBe("Pending Delivery");

    const monthlyKpi = kpis.find((k) => k.key === "monthly_received");
    expect(monthlyKpi).toBeDefined();
    expect(monthlyKpi?.label).toBe("Monthly Orders Received");


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

    const skuUnmapped: OpsRecord = {
      row: 6,
      id: "ORD-5",
      title: "Order 5",
      status: "SKU not mapped",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: { "Action taken": "", status: "SKU not mapped" },
    };

    expect(isNotYetProcessed(unproc1)).toBe(true);
    expect(isNotYetProcessed(unproc2)).toBe(true);
    expect(isNotYetProcessed(cancelled)).toBe(false);
    expect(isNotYetProcessed(processed)).toBe(false);
    expect(isNotYetProcessed(skuUnmapped)).toBe(false);
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

  it("filters Above 50k records strictly by Order Date and updates counts on month change", () => {
    const octRange: DateRange = {
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-11-01T00:00:00.000Z"),
    };
    const novRange: DateRange = {
      from: new Date("2026-11-01T00:00:00.000Z"),
      to: new Date("2026-12-01T00:00:00.000Z"),
    };

    const octRecord: OpsRecord = {
      row: 10,
      id: "ORD-OCT",
      title: "Oct Order",
      status: "New",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: {
        "Order Date": "46312", // 2026-10-17
        "Action taken": "",
        status: "",
        "Delivered yes/no)": "No",
      },
    };

    const novRecord: OpsRecord = {
      row: 11,
      id: "ORD-NOV",
      title: "Nov Order",
      status: "New",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: {
        "Order Date": "46327", // 2026-11-01
        "Action taken": "",
        status: "",
        "Delivered yes/no)": "No",
      },
    };

    const unDatedRecord: OpsRecord = {
      row: 12,
      id: "ORD-UNDATED",
      title: "No Date Order",
      status: "New",
      priority: null,
      category: null,
      team: null,
      assignee: null,
      createdAt: null,
      dueAt: null,
      resolvedAt: null,
      raw: {
        "Order Date": null,
        "Action taken": "",
        status: "",
        "Delivered yes/no)": "No",
      },
    };

    // Monthly Received
    expect(isMonthlyReceived(octRecord, octRange)).toBe(true);
    expect(isMonthlyReceived(octRecord, novRange)).toBe(false);
    expect(isMonthlyReceived(novRecord, novRange)).toBe(true);
    expect(isMonthlyReceived(novRecord, octRange)).toBe(false);
    expect(isMonthlyReceived(unDatedRecord, octRange)).toBe(false);
    expect(isMonthlyReceived(unDatedRecord, novRange)).toBe(false);

    // Pending Processing with range
    expect(isNotYetProcessed(octRecord, octRange)).toBe(true);
    expect(isNotYetProcessed(octRecord, novRange)).toBe(false);
    expect(isNotYetProcessed(novRecord, novRange)).toBe(true);

    // Pending Delivery with range
    expect(isNotYetDelivered(octRecord, octRange)).toBe(true);
    expect(isNotYetDelivered(octRecord, novRange)).toBe(false);
    expect(isNotYetDelivered(novRecord, novRange)).toBe(true);
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

  describe("V-MODA Engraving Metrics & Filters", () => {
    const vmodaRecords: OpsRecord[] = [
      {
        row: 2,
        subsheet: "V-MODA",
        id: "932101",
        title: "Order 932101",
        status: "Waiting on Customer",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order no.": "#932101",
          "Email id": "cust1@example.com",
          "Amount": "19999",
          "SKU": "V-MODA - M-100 Master",
          "Wants it Engraved?": "Yes",
          "Status": "Waiting on Customer",
          "Remark": "Customer to share logo",
          "Dispatched or Not ": "",
        },
      },
      {
        row: 3,
        subsheet: "V-MODA",
        id: "932102",
        title: "Order 932102",
        status: "Waiting on Logo",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order no.": "#932102",
          "Email id": "cust2@example.com",
          "Amount": "24999",
          "SKU": "V-MODA - Crossfade 3 Wireless",
          "Wants it Engraved?": "Yes",
          "Status": "Waiting on Logo",
          "Remark": "Requested vector SVG",
          "Dispatched or Not ": "",
        },
      },
      {
        row: 4,
        subsheet: "V-MODA",
        id: "932103",
        title: "Order 932103",
        status: "Waiting on Engraving",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order no.": "#932103",
          "Email id": "cust3@example.com",
          "Amount": "21999",
          "SKU": "V-MODA - M-200 ANC",
          "Wants it Engraved?": "Yes",
          "Status": "Waiting on Engraving",
          "Remark": "Logo approved",
          "Dispatched or Not ": "",
        },
      },
      {
        row: 5,
        subsheet: "V-MODA",
        id: "932105",
        title: "Order 932105",
        status: "Pending on Dispatch",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order no.": "#932105",
          "Email id": "cust4@example.com",
          "Amount": "28999",
          "SKU": "V-MODA - Hex Headphone",
          "Wants it Engraved?": "Yes",
          "Status": "Pending on Dispatch",
          "Remark": "Engraving finished, packed",
          "Dispatched or Not ": "",
        },
      },
      {
        row: 6,
        subsheet: "Above 50k Orders",
        id: "932104",
        title: "Order 932104",
        status: "In Transit",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order No": "#932104",
          "Amt": "65000",
          "Action taken": "bluedart - 12345678",
          "status": "In Transit",
        },
      },
    ];

    it("correctly identifies V-MODA vs Above 50k records", () => {
      expect(isVModaRecord(vmodaRecords[0])).toBe(true);
      expect(isVModaRecord(vmodaRecords[1])).toBe(true);
      expect(isVModaRecord(vmodaRecords[2])).toBe(true);
      expect(isVModaRecord(vmodaRecords[3])).toBe(true);
      expect(isVModaRecord(vmodaRecords[4])).toBe(false);

      expect(isAbove50kRecord(vmodaRecords[4])).toBe(true);
      expect(isAbove50kRecord(vmodaRecords[0])).toBe(false);
    });

    it("correctly filters V-MODA status conditions", () => {
      expect(isWaitingOnCustomer(vmodaRecords[0])).toBe(true);
      expect(isWaitingOnCustomer(vmodaRecords[1])).toBe(false);

      expect(isWaitingOnLogo(vmodaRecords[1])).toBe(true);
      expect(isWaitingOnLogo(vmodaRecords[2])).toBe(false);

      expect(isWaitingOnEngraving(vmodaRecords[2])).toBe(true);
      expect(isWaitingOnEngraving(vmodaRecords[0])).toBe(false);

      expect(isPendingOnDispatch(vmodaRecords[3])).toBe(true);
      expect(isPendingOnDispatch(vmodaRecords[0])).toBe(false);

      // Verify sheet isolation: non-V-MODA record with matching status must return false
      const nonVModaWithCustStatus: OpsRecord = {
        row: 99,
        subsheet: "Above 50k Orders",
        id: "NON-VMODA",
        title: "Test",
        status: "Waiting on Customer",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "status": "Waiting on Customer",
        },
      };
      expect(isWaitingOnCustomer(nonVModaWithCustStatus)).toBe(false);
      expect(isWaitingOnLogo(nonVModaWithCustStatus)).toBe(false);
      expect(isWaitingOnEngraving(nonVModaWithCustStatus)).toBe(false);
      expect(isPendingOnDispatch(nonVModaWithCustStatus)).toBe(false);

      // Verify case-insensitivity & whitespace trimming
      const vmodaCaseInsensitive: OpsRecord = {
        row: 100,
        subsheet: "V-MODA",
        id: "VMODA-CI",
        title: "Case Insensitive Test",
        status: "waiting on customer  ",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Status": "  Waiting On Customer  ",
        },
      };
      expect(isWaitingOnCustomer(vmodaCaseInsensitive)).toBe(true);
    });

    it("computes accurate V-MODA KPIs with total counts and amounts", () => {
      const kpis = computeVModaKpis(vmodaRecords, range, config);
      expect(kpis.length).toBe(4);

      const custKpi = kpis.find((k) => k.key === "vmoda_waiting_customer");
      expect(custKpi).toBeDefined();
      expect(custKpi?.value).toBe(1);
      expect(custKpi?.totalAmount).toBe(19999);

      const logoKpi = kpis.find((k) => k.key === "vmoda_waiting_logo");
      expect(logoKpi).toBeDefined();
      expect(logoKpi?.value).toBe(1);
      expect(logoKpi?.totalAmount).toBe(24999);

      const engrKpi = kpis.find((k) => k.key === "vmoda_waiting_engraving");
      expect(engrKpi).toBeDefined();
      expect(engrKpi?.value).toBe(1);
      expect(engrKpi?.totalAmount).toBe(21999);

      const dispKpi = kpis.find((k) => k.key === "vmoda_pending_dispatch");
      expect(dispKpi).toBeDefined();
      expect(dispKpi?.value).toBe(1);
      expect(dispKpi?.totalAmount).toBe(28999);
    });
  });

  describe("Demo Units To be Dispatch Metrics", () => {
    const demoRecords: OpsRecord[] = [
      {
        row: 10,
        id: "DEMO-1",
        title: "Demo 1",
        status: "",
        subsheet: "Demo ",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "#1121446",
          "Order Amount": "15,000",
          "Product Name": "Custom - Junior (Ex-Demo Unit)",
          "Inspection & Check Status": "",
          "Generate AWB?": "",
          "AWB ": "",
          "Dispatch status": "",
          "delivery status": "",
        },
      },
      {
        row: 11,
        id: "DEMO-2",
        title: "Demo 2",
        status: "",
        subsheet: "Demo ",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "#1139552",
          "Order Amount": "22,500",
          "Product Name": "Custom - Senior (Ex-Demo Unit)",
          "Inspection & Check Status": "Checked",
          "Generate AWB?": "Yes",
          "AWB ": "123456789",
          "Dispatch status": "",
        },
      },
      {
        row: 12,
        id: "DEMO-3",
        title: "Demo 3",
        status: "Cancelled",
        subsheet: "Demo ",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "#1140000",
          "Order Amount": "10,000",
          "Product Name": "Custom Unit",
          "Inspection & Check Status": "",
          "Generate AWB?": "",
          "AWB ": "",
          "Dispatch status": "disp cancelled",
          "delivery status": "Cancelled",
        },
      },
      {
        row: 13,
        id: "DEMO-4",
        title: "Demo 4",
        status: "Dispatched",
        subsheet: "Demo ",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "#1140001",
          "Order Amount": "30,000",
          "Product Name": "Custom Unit 2",
          "Inspection & Check Status": "TRUE",
          "Generate AWB?": "Yes",
          "AWB ": "987654321",
          "Dispatch status": "Dispatched",
        },
      },
    ];

    it("correctly identifies Demo records", () => {
      expect(isDemoRecord(demoRecords[0])).toBe(true);
      expect(isDemoRecord(demoRecords[1])).toBe(true);
      expect(isDemoRecord(demoRecords[2])).toBe(true);
      expect(isAbove50kRecord(demoRecords[0])).toBe(false);
      expect(isVModaRecord(demoRecords[0])).toBe(false);
    });

    it("identifies Order Received but not processed", () => {
      expect(isDemoOrderReceivedNotProcessed(demoRecords[0])).toBe(true);
      expect(isDemoOrderReceivedNotProcessed(demoRecords[1])).toBe(false);
      // Cancelled order should be excluded
      expect(isDemoOrderReceivedNotProcessed(demoRecords[2])).toBe(false);
    });

    it("identifies Processed but not Dispatched", () => {
      expect(isDemoProcessedNotDispatched(demoRecords[0])).toBe(false);
      expect(isDemoProcessedNotDispatched(demoRecords[1])).toBe(true);
      expect(isDemoProcessedNotDispatched(demoRecords[2])).toBe(false);
      expect(isDemoProcessedNotDispatched(demoRecords[3])).toBe(false);
    });

    it("computes accurate Demo KPIs with total counts and amounts", () => {
      const kpis = computeDemoKpis(demoRecords, range, config);
      expect(kpis.length).toBe(2);

      const receivedKpi = kpis.find((k) => k.key === "demo_received_not_processed");
      expect(receivedKpi).toBeDefined();
      expect(receivedKpi?.value).toBe(1);
      expect(receivedKpi?.totalAmount).toBe(15000);

      const processedKpi = kpis.find((k) => k.key === "demo_processed_not_dispatched");
      expect(processedKpi).toBeDefined();
      expect(processedKpi?.value).toBe(1);
      expect(processedKpi?.totalAmount).toBe(22500);
    });
  });

  describe("Kanto Products Metrics", () => {
    const kantoRecords: OpsRecord[] = [
      {
        row: 148,
        id: "1206219",
        title: "Kanto Order 1",
        status: "Order Received",
        subsheet: "Kanto",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-10-30T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1206219",
          "Order Date": "46326",
          "SKU": "Kanto - ORA4 - Matte Black",
          "Order Value ": "33999",
          "Assembling Due Date": "46328", // 2026-11-02
          "Assembled? ": "",
          "Status": "",
        },
      },
      {
        row: 5,
        id: "1095682",
        title: "Kanto Order 2",
        status: "Order Received",
        subsheet: "Kanto",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-07-15T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1095682",
          "Order Date": "46222",
          "SKU": "Kanto - ORA - Matte White",
          "Order Value ": "24999",
          "Assembling Due Date": "46223", // 2026-07-20
          "Assembled? ": "No",
          "Status": "No Stock",
        },
      },
      {
        row: 6,
        id: "1095798",
        title: "Kanto Order 3",
        status: "Order Received",
        subsheet: "Kanto",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-07-16T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1095798",
          "Order Date": "46222",
          "SKU": "Kanto - Uki - Sage",
          "Order Value ": "16999",
          "Assembling Due Date": "46223",
          "Assembled? ": "Yes",
          "Status": "Delivered",
        },
      },
      {
        row: 14,
        id: "1099943",
        title: "Kanto Order 4",
        status: "Order Received",
        subsheet: "Kanto",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-07-18T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1099943",
          "Order Date": "46224",
          "SKU": "Kanto - Uki - Pumice",
          "Order Value ": "16999",
          "Assembling Due Date": "46225",
          "Assembled? ": "Yes",
          "Status": "Dispatched",
        },
      },
      {
        row: 13,
        id: "1099481",
        title: "Kanto Order 5",
        status: "Order Received",
        subsheet: "Kanto",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-07-17T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1099481",
          "Order Date": "46224",
          "SKU": "Kanto - Uki - Sage",
          "Order Value ": "16999",
          "Assembling Due Date": "46225",
          "Assembled? ": "Yes",
          "Status": "Cancelled ",
        },
      },
    ];

    it("correctly identifies Kanto records", () => {
      expect(isKantoRecord(kantoRecords[0])).toBe(true);
      expect(isKantoRecord(kantoRecords[1])).toBe(true);
      expect(isAbove50kRecord(kantoRecords[0])).toBe(false);
      expect(isVModaRecord(kantoRecords[0])).toBe(false);
      expect(isDemoRecord(kantoRecords[0])).toBe(false);
    });

    it("identifies Waiting on Assembly (Assembled? is Blank)", () => {
      expect(isKantoWaitingOnAssembly(kantoRecords[0])).toBe(true);
      expect(isKantoWaitingOnAssembly(kantoRecords[1])).toBe(false);
      expect(isKantoWaitingOnAssembly(kantoRecords[2])).toBe(false);
    });

    it("identifies Waiting on Process (Status excludes Processed/Fulfilled, Cancelled, Delivered, Dispatched)", () => {
      expect(isKantoWaitingOnProcess(kantoRecords[0])).toBe(true); // blank status -> waiting on process
      expect(isKantoWaitingOnProcess(kantoRecords[1])).toBe(true); // No Stock -> waiting on process
      expect(isKantoWaitingOnProcess(kantoRecords[2])).toBe(false); // Delivered -> excluded
      expect(isKantoWaitingOnProcess(kantoRecords[3])).toBe(false); // Dispatched -> excluded
      expect(isKantoWaitingOnProcess(kantoRecords[4])).toBe(false); // Cancelled -> excluded
    });

    it("accurately evaluates Due Date into Overdue vs Within Due Date", () => {
      const fixedNow = new Date("2026-11-01T12:00:00.000Z");

      const due1 = getKantoAssemblingDueDate(kantoRecords[0]); // 2026-11-02
      expect(due1).toBeDefined();
      expect(isKantoDueDateWithin(due1!, fixedNow)).toBe(true);
      expect(isKantoDueDateOverdue(due1!, fixedNow)).toBe(false);

      const due2 = getKantoAssemblingDueDate(kantoRecords[1]); // 2026-07-20
      expect(due2).toBeDefined();
      expect(isKantoDueDateWithin(due2!, fixedNow)).toBe(false);
      expect(isKantoDueDateOverdue(due2!, fixedNow)).toBe(true);
    });

    it("identifies Dispatched (Status is Dispatched or Delivered)", () => {
      expect(isKantoDispatched(kantoRecords[0])).toBe(false);
      expect(isKantoDispatched(kantoRecords[1])).toBe(false);
      expect(isKantoDispatched(kantoRecords[2])).toBe(true); // Delivered
      expect(isKantoDispatched(kantoRecords[3])).toBe(true); // Dispatched
      expect(isKantoDispatched(kantoRecords[4])).toBe(false); // Cancelled
    });

    it("computes accurate Kanto KPIs with Overdue and Within Due Date counts", () => {
      const fixedConfig: MetricsConfig = {
        ...config,
        now: new Date("2026-11-01T12:00:00.000Z"),
      };

      const kpis = computeKantoKpis(kantoRecords, range, fixedConfig);
      expect(kpis.length).toBe(3);

      const assemblyKpi = kpis.find((k) => k.key === "kanto_waiting_assembly");
      expect(assemblyKpi).toBeDefined();
      expect(assemblyKpi?.value).toBe(1);
      expect(assemblyKpi?.totalAmount).toBe(33999);

      const processKpi = kpis.find((k) => k.key === "kanto_waiting_process");
      expect(processKpi).toBeDefined();
      expect(processKpi?.value).toBe(2);
      expect(processKpi?.overdueCount).toBe(1);
      expect(processKpi?.withinDueCount).toBe(1);
      expect(processKpi?.totalAmount).toBe(33999 + 24999);

      const dispKpi = kpis.find((k) => k.key === "kanto_dispatched");
      expect(dispKpi).toBeDefined();
      expect(dispKpi?.value).toBe(2);
      expect(dispKpi?.totalAmount).toBe(16999 + 16999);
    });
  });

  describe("Unboxed Products cohort metrics", () => {
    const unboxedRecords: OpsRecord[] = [
      {
        row: 2,
        subsheet: "Unboxed v2",
        id: "1090677",
        title: "Order 1090677",
        status: "Processed",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-10-10T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1090677",
          "Order Date": "46218",
          "SKU": "Unboxed - ORIVETI - OD200",
          "Total Order Value": "11499",
          "Images Required(Yes/No)": "No",
          "Confirmation Due Date": "46220",
          "Availability": "Yes",
          "Status": "Processed",
        },
      },
      {
        row: 3,
        subsheet: "Unboxed v2",
        id: "1090989",
        title: "Order 1090989",
        status: "Order Received",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-10-12T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1090989",
          "Order Date": "46218",
          "SKU": "Unboxed - Headphone Zone X ddHiFi",
          "Total Order Value": "2203",
          "Images Required(Yes/No)": "Yes",
          "Confirmation Due Date": "46221",
          "Availability": "",
          "Status": "Order Received",
        },
      },
      {
        row: 4,
        subsheet: "Unboxed v2",
        id: "1091011",
        title: "Order 1091011",
        status: "Order Received",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-10-15T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1091011",
          "Order Date": "46218",
          "SKU": "Unboxed - Audio-Technica - ATH-M50x",
          "Total Order Value": "9999",
          "Images Required(Yes/No)": "No",
          "Confirmation Due Date": "46222",
          "Availability": "Yes",
          "Status": "Order Received",
        },
      },
      {
        row: 5,
        subsheet: "Unboxed v2",
        id: "1091012",
        title: "Order 1091012",
        status: "Cancelled",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-10-16T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1091012",
          "Order Date": "46218",
          "SKU": "Unboxed - Sennheiser - HD 600",
          "Total Order Value": "24999",
          "Images Required(Yes/No)": "No",
          "Confirmation Due Date": "46223",
          "Availability": "Yes",
          "Status": "Cancelled ",
        },
      },
      {
        row: 6,
        subsheet: "Unboxed v2",
        id: "1091013",
        title: "Order 1091013",
        status: "Order Received",
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: "2026-10-17T10:00:00.000Z",
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order Number": "1091013",
          "Order Date": "46218",
          "SKU": "Unboxed - Focal - Bathys",
          "Total Order Value": "49999",
          "Images Required(Yes/No)": "No",
          "Confirmation Due Date": "46224",
          "Availability": "No",
          "Status": "Order Received",
        },
      },
    ];

    it("correctly identifies Unboxed records", () => {
      expect(isUnboxedRecord(unboxedRecords[0])).toBe(true);
      expect(isAbove50kRecord(unboxedRecords[0])).toBe(false);
      expect(isVModaRecord(unboxedRecords[0])).toBe(false);
      expect(isDemoRecord(unboxedRecords[0])).toBe(false);
      expect(isKantoRecord(unboxedRecords[0])).toBe(false);
    });

    it("identifies Waiting on Confirmation (Availability is blank)", () => {
      expect(isUnboxedWaitingOnConfirmation(unboxedRecords[0])).toBe(false); // Availability: Yes
      expect(isUnboxedWaitingOnConfirmation(unboxedRecords[1])).toBe(true);  // Availability: blank
      expect(isUnboxedWaitingOnConfirmation(unboxedRecords[2])).toBe(false); // Availability: Yes
      expect(isUnboxedWaitingOnConfirmation(unboxedRecords[4])).toBe(false); // Availability: No (not blank)
    });

    it("identifies Waiting on Process (Availability is Yes AND Status != Processed AND Status does not contain Cancelled)", () => {
      expect(isUnboxedWaitingOnProcess(unboxedRecords[0])).toBe(false); // Processed
      expect(isUnboxedWaitingOnProcess(unboxedRecords[1])).toBe(false); // Availability is blank
      expect(isUnboxedWaitingOnProcess(unboxedRecords[2])).toBe(true);  // Availability: Yes, Status: Order Received
      expect(isUnboxedWaitingOnProcess(unboxedRecords[3])).toBe(false); // Status: Cancelled
      expect(isUnboxedWaitingOnProcess(unboxedRecords[4])).toBe(false); // Availability is No
    });

    it("computes accurate Unboxed KPIs within selected date range", () => {
      const kpis = computeUnboxedKpis(unboxedRecords, range, config);
      expect(kpis.length).toBe(2);

      const confKpi = kpis.find((k) => k.key === "unboxed_waiting_confirmation");
      expect(confKpi).toBeDefined();
      expect(confKpi?.value).toBe(1);
      expect(confKpi?.totalAmount).toBe(2203);

      const procKpi = kpis.find((k) => k.key === "unboxed_waiting_process");
      expect(procKpi).toBeDefined();
      expect(procKpi?.value).toBe(1);
      expect(procKpi?.totalAmount).toBe(9999);
    });
  });

  describe("High Value Cancellations Cohort", () => {
    const hvcRecords: OpsRecord[] = [
      {
        row: 2,
        subsheet: "High Value Cancellations",
        id: "1090001",
        title: "Order 1090001",
        status: null,
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order ID": "1090001",
          "Order Name": "#1090001",
          "Customer Name": "Rahul Sharma",
          "Customer Phone": "+91 9876543210",
          "Email": "rahul@example.com",
          "Total": "52,490.00",
          "Products": "Sennheiser HD 660S2",
          "Payment Gateway": "Razorpay",
          "Please share the reason for cancellation": "Found better price",
          "What would you like?": "Refund",
          "Customer Choice": "Refund",
          "Result": "Refunded",
        },
      },
      {
        row: 3,
        subsheet: "High Value Cancellations",
        id: "1090002",
        title: "Order 1090002",
        status: null,
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order ID": "1090002",
          "Order Name": "#1090002",
          "Customer Name": "Priya Patel",
          "Customer Phone": "+91 9876543211",
          "Email": "priya@example.com",
          "Total": "64,990.00",
          "Products": "Hifiman Arya Organic",
          "Payment Gateway": "PayU",
          "Please share the reason for cancellation": "Ordered wrong color",
          "What would you like?": "Store Credit",
          "Customer Choice": "Store Credit",
          "Result": "", // Blank -> Pending on Attend
        },
      },
      {
        row: 4,
        subsheet: "High Value Cancellations",
        id: "1090003",
        title: "Order 1090003",
        status: null,
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order ID": "1090003",
          "Order Name": "#1090003",
          "Customer Name": "Amit Kumar",
          "Customer Phone": "+91 9876543212",
          "Email": "amit@example.com",
          "Total": "72,000.00",
          "Products": "Focal Clear Mg",
          "Payment Gateway": "Simpl",
          "Please share the reason for cancellation": "Delayed delivery",
          "What would you like?": "Refund",
          "Customer Choice": "Refund",
          "Result": "Salvaged",
        },
      },
      {
        row: 5,
        subsheet: "High Value Cancellations",
        id: "1090004",
        title: "Order 1090004",
        status: null,
        priority: null,
        category: null,
        team: null,
        assignee: null,
        createdAt: null,
        dueAt: null,
        resolvedAt: null,
        raw: {
          "Order ID": "1090004",
          "Order Name": "#1090004",
          "Customer Name": "Sneha Gupta",
          "Customer Phone": "+91 9876543213",
          "Email": "sneha@example.com",
          "Total": "55,000.00",
          "Products": "Audeze LCD-X",
          "Payment Gateway": "Cashfree",
          "Please share the reason for cancellation": "Changed mind",
          "What would you like?": "Store Credit",
          "Customer Choice": "Store Credit",
          "Result": "(blank)", // Blank -> Pending on Attend
        },
      },
    ];

    it("correctly identifies High Value Cancellations records and excludes them from Above 50k", () => {
      expect(isHvcRecord(hvcRecords[0])).toBe(true);
      expect(isAbove50kRecord(hvcRecords[0])).toBe(false);
      expect(isVModaRecord(hvcRecords[0])).toBe(false);
      expect(isDemoRecord(hvcRecords[0])).toBe(false);
      expect(isKantoRecord(hvcRecords[0])).toBe(false);
      expect(isUnboxedRecord(hvcRecords[0])).toBe(false);
    });

    it("identifies Pending on Attend when Result column is blank or empty", () => {
      expect(isHvcPendingOnAttend(hvcRecords[0])).toBe(false); // Result: Refunded
      expect(isHvcPendingOnAttend(hvcRecords[1])).toBe(true);  // Result: ""
      expect(isHvcPendingOnAttend(hvcRecords[2])).toBe(false); // Result: Salvaged
      expect(isHvcPendingOnAttend(hvcRecords[3])).toBe(true);  // Result: "(blank)"
    });

    it("computes accurate High Value Cancellations KPIs with refund and store credit breakdown", () => {
      const kpis = computeHvcKpis(hvcRecords, range, config);
      expect(kpis.length).toBe(2);

      const receivedKpi = kpis.find((k) => k.key === "hvc_received");
      expect(receivedKpi).toBeDefined();
      expect(receivedKpi?.value).toBe(4);
      expect(receivedKpi?.refundCount).toBe(2);
      expect(receivedKpi?.storeCreditCount).toBe(2);
      expect(receivedKpi?.totalAmount).toBe(52490 + 64990 + 72000 + 55000);

      const pendingKpi = kpis.find((k) => k.key === "hvc_pending_attend");
      expect(pendingKpi).toBeDefined();
      expect(pendingKpi?.value).toBe(2);
      expect(pendingKpi?.totalAmount).toBe(64990 + 55000);
    });
  });
});
