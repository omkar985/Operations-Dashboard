import { requireAdminPage } from "@/lib/auth/dal";
import { getSheetMapping } from "@/server/services/settings-service";
import { inspectSource, type SourceInspection } from "@/server/services/source-inspector";
import { getSheetsConfig } from "@/lib/env";
import { SourceMappingEditor } from "@/components/admin/source-mapping-editor";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertCircle } from "lucide-react";

export default async function AdminSourcePage() {
  await requireAdminPage();
  const mapping = await getSheetMapping();
  const hasConfig = Boolean(getSheetsConfig());

  if (!hasConfig) {
    return (
      <div className="page space-y-6">
        <h1 className="page-title">Source &amp; Column Mapping</h1>
        <EmptyState
          icon={<AlertCircle className="w-6 h-6 stroke-[1.5] text-amber-500" />}
          title="Google Sheets Credentials Missing"
          description="GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_SPREADSHEET_ID must be configured in your environment."
        />
      </div>
    );
  }

  let inspection: SourceInspection | null = null;
  try {
    inspection = await inspectSource({
      worksheet: mapping?.worksheet,
      headerRow: mapping?.headerRow,
    });
  } catch {
    // If the spreadsheet or worksheet is temporarily unavailable, editor allows manual retry
    inspection = null;
  }

  return (
    <div className="page space-y-6">
      <div>
        <h1 className="page-title">Source &amp; Column Mapping</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Connect your Google Sheet headers to canonical Operations Dashboard instruments
        </p>
      </div>

      <SourceMappingEditor
        initialMapping={mapping}
        initialInspection={inspection}
      />
    </div>
  );
}
