"use client";

import React, { useState } from "react";
import type { OpsRecord } from "@/types/operations";
import type { Kpi, KpiKey, DateRange } from "@/lib/metrics/compute";
import { KpiLedger } from "@/components/ui/kpi-ledger";
import { KpiRecordsModal } from "./kpi-records-modal";

interface Above50kSectionProps {
  records: OpsRecord[];
  kpis: Kpi[];
  range: DateRange;
}

export function Above50kSection({ records, kpis, range }: Above50kSectionProps) {
  const [selectedKpi, setSelectedKpi] = useState<{
    key: KpiKey;
    label: string;
  } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCardClick = (key: KpiKey, label: string) => {
    setSelectedKpi({ key, label });
    setIsModalOpen(true);
  };

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Above ₹50,000 Orders
        </h2>
        <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
          Click any card below to view order details and Shopify links
        </p>
      </div>

      {/* Glassmorphic KPI Cards */}
      <KpiLedger kpis={kpis} onCardClick={handleCardClick} />

      {/* Drill-down Records Modal */}
      <KpiRecordsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        kpiKey={selectedKpi?.key ?? null}
        kpiTitle={selectedKpi?.label ?? "Order Records"}
        records={records}
        range={range}
      />
    </section>
  );
}

