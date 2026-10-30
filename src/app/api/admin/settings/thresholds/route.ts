import { apiRoute } from "@/server/http/api-route";
import { thresholdsSchema } from "@/lib/validation/schemas";
import { saveThresholds } from "@/server/services/settings-service";

export const PUT = apiRoute(
  {
    auth: "admin",
    schema: thresholdsSchema,
    rateLimit: "adminMutation",
    idempotent: true,
    operation: "admin.settings.thresholds",
  },
  async ({ body, user, ip }) => {
    await saveThresholds(user, body, ip);
    return { ok: true };
  }
);
