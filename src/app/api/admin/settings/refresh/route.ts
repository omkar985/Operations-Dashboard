import { apiRoute } from "@/server/http/api-route";
import { refreshSettingsSchema } from "@/lib/validation/schemas";
import { saveRefreshSettings } from "@/server/services/settings-service";

export const PUT = apiRoute({ auth: "admin", schema: refreshSettingsSchema }, async ({ body, user, ip }) => {
  await saveRefreshSettings(user, body, ip);
  return { ok: true };
});
