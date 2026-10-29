import { apiRoute } from "@/server/http/api-route";
import { getSessionUser } from "@/lib/auth/session";
import { logout } from "@/server/services/auth-service";

export const POST = apiRoute({ auth: "public" }, async ({ ip }) => {
  await logout(await getSessionUser(), ip);
  return { ok: true };
});
