"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Download } from "lucide-react";
import { useToast } from "@/components/providers/toast-provider";

interface LiveRefreshHeaderProps {
  exportUrl: string;
}

export function LiveRefreshHeader({ exportUrl }: LiveRefreshHeaderProps) {
  const router = useRouter();
  const toast = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    setLastUpdated(
      new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    );

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          router.refresh();
          setLastUpdated(
            new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })
          );
          return 120;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [router]);

  async function handleManualRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/data/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success(
          "Data Refreshed",
          body.data?.recordCount !== undefined
            ? `Synchronized ${body.data.recordCount.toLocaleString()} operational records.`
            : "Operations ledger synchronized."
        );
        setSecondsLeft(120);
        setLastUpdated(
          new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })
        );
        router.refresh();
      } else {
        toast.error("Sync Notice", body.error?.message || "Sync already in progress.");
      }
    } catch {
      toast.error("Network Error", "Unable to trigger dataset sync.");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col sm:items-end gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Refresh & Live indicator pill */}
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="btn btn-sm btn-ghost h-8 px-2.5 text-xs font-medium border border-[var(--line)] bg-[var(--card)] hover:border-[var(--line-hover)] flex items-center gap-1.5 shadow-xs"
          title="Refresh operations dataset"
        >
          <RefreshCw className={`w-3 h-3 text-[var(--primary-ink)] ${isRefreshing ? "spin" : ""}`} />
          <span>Refresh ({secondsLeft} s)</span>
        </button>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live</span>
        </div>

        {/* Export CSV button */}
        <a
          href={exportUrl}
          className="btn btn-sm btn-ghost h-8 px-2.5 text-xs text-[var(--muted-strong)] hover:text-[var(--ink)] border border-[var(--line)] bg-[var(--card)] shadow-xs"
          title="Export filtered records to CSV"
          download
        >
          <Download className="w-3 h-3" />
          <span className="hidden sm:inline">Export</span>
        </a>
      </div>

      {lastUpdated && (
        <span className="text-[11px] font-mono text-[var(--muted)]">
          Last updated {lastUpdated}
        </span>
      )}
    </div>
  );
}
