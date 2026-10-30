import { apiRoute } from "@/server/http/api-route";
import { createInvitationSchema } from "@/lib/validation/schemas";
import { createInvitationFor } from "@/server/services/invitation-service";

export const POST = apiRoute(
  {
    auth: "admin",
    schema: createInvitationSchema,
    rateLimit: "invitationCreate",
    idempotent: true,
    operation: "admin.invitations.create",
  },
  async ({ body, user, ip }) => {
    const result = await createInvitationFor({ actor: user, email: body.email, role: body.role, ip });
    return { result };
  }
);
