import { requireAdminPage } from "@/lib/auth/dal";
import { getRefreshSettings, getThresholds } from "@/server/services/settings-service";
import { listSyncRuns, listAudit } from "@/server/repositories/platform";
import { SystemManager } from "@/components/admin/system-manager";

export default async function AdminSystemPage() {
  await requireAdminPage();

  const [refreshSettings, thresholds, syncRuns, auditLogs] = await Promise.all([
    getRefreshSettings(),
    getThresholds(),
    listSyncRuns(25),
    listAudit(50),
  ]);

  return (
    <div className="page space-y-6">
      <div>
        <h1 className="page-title">System &amp; Audit Logs</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Monitor ingest pipelines, tune cache TTLs, and inspect security events
        </p>
      </div>

      <SystemManager
        initialRefresh={refreshSettings}
        initialThresholds={thresholds}
        syncRuns={syncRuns}
        auditLogs={auditLogs}
      />
    </div>
  );
}
