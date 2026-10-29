import { requireAdminPage } from "@/lib/auth/dal";
import { listNotifications } from "@/server/repositories/outbox";
import { OutboxManager } from "@/components/admin/outbox-manager";

export default async function AdminOutboxPage() {
  await requireAdminPage();
  const notifications = await listNotifications(200);

  return (
    <div className="page space-y-6">
      <div>
        <h1 className="page-title">Transactional Email Outbox</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Inspect notification queue status, delivery logs, and retry failed dispatches
        </p>
      </div>

      <OutboxManager initialNotifications={notifications} />
    </div>
  );
}
