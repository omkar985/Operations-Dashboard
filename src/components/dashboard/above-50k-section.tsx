"use client";

import React, { useState } from "react";
import { Sparkles, Layers } from "lucide-react";
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold tracking-wider uppercase bg-[#0284C7]/10 text-[#0284C7] dark:text-[#38BDF8] border border-[#0284C7]/20">
              <Sparkles className="w-3 h-3" />
              Above 50k Orders Section
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            Above ₹50,000 Orders
          </h2>
          <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time fulfillment pipeline &bull; Click any KPI card below to inspect order details and Shopify links
          </p>
        </div>
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

