import { apiRoute } from "@/server/http/api-route";
import { uuidSchema, updateUserSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/errors";
import { updateMember } from "@/server/services/user-admin-service";

export const PATCH = apiRoute<typeof updateUserSchema, { id: string }>(
  {
    auth: "admin",
    schema: updateUserSchema,
    rateLimit: "adminMutation",
    idempotent: true,
    operation: "admin.members.update",
  },
  async ({ body, user, ip, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw new AppError("BAD_REQUEST", "Invalid member id.");
    const member = await updateMember({ actor: user, targetId: id.data, role: body.role, isActive: body.isActive, ip });
    return { member };
  }
);
