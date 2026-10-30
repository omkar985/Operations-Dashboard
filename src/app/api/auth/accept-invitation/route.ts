import { apiRoute } from "@/server/http/api-route";
import { acceptInvitationSchema } from "@/lib/validation/schemas";
import { acceptInvitation } from "@/server/services/auth-service";

export const POST = apiRoute(
  {
    auth: "public",
    schema: acceptInvitationSchema,
    rateLimit: "passwordReset",
    idempotent: true,
    operation: "auth.acceptInvitation",
  },
  async ({ body, ip }) => {
    const user = await acceptInvitation({ token: body.token, name: body.name, password: body.password, ip });
    return { ok: true, email: user.email };
  }
);
