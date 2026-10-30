import { apiRoute } from "@/server/http/api-route";
import { resetPasswordSchema } from "@/lib/validation/schemas";
import { resetPassword } from "@/server/services/auth-service";

export const POST = apiRoute(
  {
    auth: "public",
    schema: resetPasswordSchema,
    rateLimit: "passwordReset",
    idempotent: true,
    operation: "auth.resetPassword",
  },
  async ({ body, ip }) => {
    await resetPassword({ token: body.token, password: body.password, ip });
    return { ok: true };
  }
);
