import { apiRoute } from "@/server/http/api-route";
import { changePasswordSchema } from "@/lib/validation/schemas";
import { changePassword } from "@/server/services/auth-service";

export const POST = apiRoute({ auth: "user", schema: changePasswordSchema }, async ({ body, user, ip }) => {
  await changePassword({ user, currentPassword: body.currentPassword, newPassword: body.newPassword, ip });
  return { ok: true };
});
