import { apiRoute } from "@/server/http/api-route";
import { changePasswordSchema } from "@/lib/validation/schemas";
import { changePassword } from "@/server/services/auth-service";

export const POST = apiRoute(
  {
    auth: "user",
    schema: changePasswordSchema,
    rateLimit: "passwordReset",
    idempotent: true,
    operation: "auth.changePassword",
  },
  async ({ body, user, ip }) => {
    await changePassword({ user, currentPassword: body.currentPassword, newPassword: body.newPassword, ip });
    return { ok: true };
  }
);
