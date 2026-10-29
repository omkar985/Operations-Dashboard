import { apiRoute } from "@/server/http/api-route";
import { signOutEverywhere } from "@/server/services/auth-service";

export const POST = apiRoute({ auth: "user" }, async ({ user, ip }) => {
  await signOutEverywhere(user, ip);
  return { ok: true };
});
