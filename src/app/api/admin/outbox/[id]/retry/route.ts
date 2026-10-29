import { apiRoute } from "@/server/http/api-route";
import { AppError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation/schemas";
import { retryNotification } from "@/server/services/notification-service";
import { getNotification } from "@/server/repositories/outbox";
import { writeAudit } from "@/server/repositories/platform";

export const POST = apiRoute<undefined, { id: string }>({ auth: "admin" }, async ({ user, ip, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw new AppError("BAD_REQUEST", "Invalid notification id.");
  const outcome = await retryNotification(id.data);
  const after = await getNotification(id.data);
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "outbox.retry", targetType: "notification", targetId: id.data, metadata: { outcome }, ip });
  return { outcome, status: after?.status ?? null, error: after?.last_error ?? null };
});
