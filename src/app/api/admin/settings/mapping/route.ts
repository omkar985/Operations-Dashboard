import { after } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { sheetMappingSchema } from "@/lib/validation/schemas";
import { saveSheetMapping } from "@/server/services/settings-service";
import { invalidateDatasetCache } from "@/server/services/dataset-service";
import { runSync } from "@/server/services/sync-service";
import { getSheetsConfig } from "@/lib/env";
import { log } from "@/lib/logger";
import type { SheetMapping } from "@/types/operations";

/** Saves the column mapping and immediately re-synchronises so dashboards reflect it. */
export const PUT = apiRoute({ auth: "admin", schema: sheetMappingSchema }, async ({ body, user, ip }) => {
  await saveSheetMapping(user, body as SheetMapping, ip);
  invalidateDatasetCache();
  const willSync = Boolean(getSheetsConfig());
  if (willSync) {
    after(async () => {
      try {
        await runSync({ trigger: "manual", actor: user });
      } catch (err) {
        log.warn("post_mapping_sync_failed", { error: err });
      }
    });
  }
  return { ok: true, syncScheduled: willSync };
});
