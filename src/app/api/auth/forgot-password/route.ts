import { apiRoute } from "@/server/http/api-route";
import { forgotPasswordSchema } from "@/lib/validation/schemas";
import { requestPasswordReset } from "@/server/services/auth-service";

/** Always answers identically so the endpoint cannot be used to discover which emails have accounts. */
export const POST = apiRoute(
  {
    auth: "public",
    schema: forgotPasswordSchema,
    rateLimit: "passwordReset",
    idempotent: true,
    operation: "auth.forgotPassword",
  },
  async ({ body, ip }) => {
    await requestPasswordReset({ email: body.email, ip });
    return { ok: true };
  }
);
