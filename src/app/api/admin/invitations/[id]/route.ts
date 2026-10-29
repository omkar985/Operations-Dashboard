import { apiRoute } from "@/server/http/api-route";
import { AppError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation/schemas";
import { resendInvitation, revokeInvitationById } from "@/server/services/invitation-service";

type P = { id: string };

const parseId = (id: string) => {
  const r = uuidSchema.safeParse(id);
  if (!r.success) throw new AppError("BAD_REQUEST", "Invalid invitation id.");
  return r.data;
};

/** Resend = rotate the token (old link dies) + queue and deliver a new email. */
export const POST = apiRoute<undefined, P>({ auth: "admin" }, async ({ user, ip, params }) => {
  const result = await resendInvitation({ actor: user, id: parseId(params.id), ip });
  return { result };
});

export const DELETE = apiRoute<undefined, P>({ auth: "admin" }, async ({ user, ip, params }) => {
  await revokeInvitationById({ actor: user, id: parseId(params.id), ip });
  return { ok: true };
});
