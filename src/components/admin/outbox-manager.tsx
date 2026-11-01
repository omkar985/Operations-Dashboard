"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { NotificationRow } from "@/types/db";
import { useToast } from "@/components/providers/toast-provider";
import { idempotentFetch } from "@/lib/http/idempotent-fetch";

interface OutboxManagerProps {
  initialNotifications: NotificationRow[];
}

export function OutboxManager({ initialNotifications }: OutboxManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [notifications, setNotifications] = useState<NotificationRow[]>(initialNotifications);
  const [filter, setFilter] = useState<string>("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const filtered = notifications.filter((n) => {
    if (filter === "all") return true;
    return n.status === filter;
  });

  async function handleRetry(id: string) {
    if (retryingId) return;
    setRetryingId(id);

    try {
      const res = await idempotentFetch(`/api/admin/outbox/${id}/retry`, { method: "POST" });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Notification Re-queued", "The message has been scheduled for immediate redelivery.");
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, status: "pending", attempts: 0 } : n))
        );
        router.refresh();
      } else {
        toast.error("Retry Failed", body.error?.message || "Failed to re-queue email.");
      }
    } catch {
      toast.error("Network Error", "Unable to contact outbox service.");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="segmented">
          <button
            type="button"
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("pending")}
            aria-pressed={filter === "pending"}
          >
            Pending ({notifications.filter((n) => n.status === "pending").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("sent")}
            aria-pressed={filter === "sent"}
          >
            Sent ({notifications.filter((n) => n.status === "sent").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("failed")}
            aria-pressed={filter === "failed"}
          >
            Failed ({notifications.filter((n) => n.status === "failed").length})
          </button>
        </div>
      </div>

      {/* Outbox Table */}
      <div className="panel overflow-hidden">
        <div className="table-wrap" data-lenis-prevent>
          <table className="table">
            <thead>
              <tr>
                <th className="min-w-[180px]">Recipient</th>
                <th className="min-w-[220px]">Subject</th>
                <th className="w-28">Type</th>
                <th className="w-32">Status</th>
                <th className="w-24">Attempts</th>
                <th className="w-36">Created</th>
                <th className="w-28 num text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-[var(--muted)]">
                    No transactional emails found matching filter &ldquo;{filter}&rdquo;.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  return (
                    <tr key={item.id}>
                      <td className="font-medium text-xs text-[var(--ink)]">
                        {item.recipient}
                      </td>

                      <td className="cell-truncate text-xs text-[var(--ink)]">
                        {item.subject}
                      </td>

                      <td>
                        <span className="badge badge-brand text-[10px]">
                          {item.type}
                        </span>
                      </td>

                      <td>
                        <div className="flex flex-col">
                          <span
                            className={`badge ${
                              item.status === "sent"
                                ? "badge-success"
                                : item.status === "failed"
                                ? "badge-error"
                                : "badge-info"
                            }`}
                          >
                            {item.status}
                          </span>
                          {item.last_error && item.status === "failed" && (
                            <span
                              className="text-[10px] text-red-600 dark:text-red-400 max-w-[200px] truncate mt-1"
                              title={item.last_error}
                            >
                              {item.last_error}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="text-xs font-mono text-[var(--muted)]">
                        {item.attempts} / 5
                      </td>

                      <td className="text-xs text-[var(--muted)] font-mono">
                        {new Date(item.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      <td className="num">
                        {item.status === "failed" && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm !h-8 !text-xs !px-2.5 rounded-lg text-[var(--primary-ink)]"
                            onClick={() => handleRetry(item.id)}
                            disabled={retryingId === item.id}
                            title="Reset attempt count and redeliver now"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 mr-1 ${retryingId === item.id ? "spin" : ""}`} />
                            <span>Retry</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
