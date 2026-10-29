import "server-only";
import { cache } from "react";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getSetting, putSetting, writeAudit } from "@/server/repositories/platform";
import { refreshSettingsSchema, sheetMappingSchema, thresholdsSchema } from "@/lib/validation/schemas";
import type { RefreshSettings, SheetMapping, Thresholds } from "@/types/operations";
import type { SessionUser } from "@/lib/auth/session";

/** Documented defaults. Admins may override each value in Admin → System. */
export const DEFAULT_THRESHOLDS: Thresholds = { slaTargetPercent: 90, ageingDays: 7 };

export const getRefreshSettings = cache(async (): Promise<RefreshSettings> => {
  const env = getEnv();
  const stored = refreshSettingsSchema.safeParse(await getSetting("refresh"));
  return stored.success
    ? stored.data
    : { refreshIntervalSeconds: env.AUTO_REFRESH_INTERVAL_SECONDS, cacheTtlSeconds: env.DATA_CACHE_TTL_SECONDS };
});

export const getThresholds = cache(async (): Promise<Thresholds> => {
  const stored = thresholdsSchema.safeParse(await getSetting("thresholds"));
  return stored.success ? stored.data : DEFAULT_THRESHOLDS;
});

export const getSheetMapping = cache(async (): Promise<SheetMapping | null> => {
  const stored = sheetMappingSchema.safeParse(await getSetting("sheet_mapping"));
  return stored.success ? (stored.data as SheetMapping) : null;
});

export async function saveRefreshSettings(actor: SessionUser, value: RefreshSettings, ip: string) {
  const before = await getRefreshSettings();
  await putSetting("refresh", value, actor.id);
  await writeAudit({ actorId: actor.id, actorEmail: actor.email, action: "settings.refresh_updated", metadata: { before, after: value }, ip });
}

export async function saveThresholds(actor: SessionUser, value: Thresholds, ip: string) {
  const before = await getThresholds();
  await putSetting("thresholds", value, actor.id);
  await writeAudit({ actorId: actor.id, actorEmail: actor.email, action: "settings.thresholds_updated", metadata: { before, after: value }, ip });
}

export async function saveSheetMapping(actor: SessionUser, value: SheetMapping, ip: string) {
  const parsed = sheetMappingSchema.safeParse(value);
  if (!parsed.success) throw new AppError("MAPPING_INVALID", "The column mapping is not valid.");
  const before = await getSheetMapping();
  await putSetting("sheet_mapping", parsed.data, actor.id);
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "settings.mapping_updated",
    metadata: { before: before?.columns ?? null, after: parsed.data.columns, worksheet: parsed.data.worksheet },
    ip,
  });
}
