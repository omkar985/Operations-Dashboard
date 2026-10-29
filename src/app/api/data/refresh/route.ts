import { apiRoute } from "@/server/http/api-route";
import { enforceRateLimit, LIMITS } from "@/lib/auth/rate-limit";
import { auditManualSync, runSync } from "@/server/services/sync-service";

/** Manual refresh. The DB lease makes concurrent clicks safe: a second caller gets SYNC_IN_PROGRESS (409). */
export const POST = apiRoute({ auth: "user" }, async ({ user, ip }) => {
  await enforceRateLimit(LIMITS.refreshUser, user.id);
  const summary = await runSync({ trigger: "manual", actor: user });
  await auditManualSync(user, ip, summary);
  return { rowsValid: summary.rowsValid, rowsRead: summary.rowsRead, warnings: summary.warnings.length };
});
