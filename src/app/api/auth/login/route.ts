import { apiRoute } from "@/server/http/api-route";
import { loginSchema } from "@/lib/validation/schemas";
import { login } from "@/server/services/auth-service";

export const POST = apiRoute({ auth: "public", schema: loginSchema }, async ({ body, ip }) => {
  const user = await login({ email: body.email, password: body.password, ip });
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role } };
});
