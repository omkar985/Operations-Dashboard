import { apiRoute } from "@/server/http/api-route";
import { AppError } from "@/lib/errors";
import { getSheetsConfig } from "@/lib/env";
import { inspectSource } from "@/server/services/source-inspector";
import { SheetsError } from "@/server/integrations/google-sheets";

export const GET = apiRoute({ auth: "admin" }, async ({ req }) => {
  if (!getSheetsConfig()) throw new AppError("SOURCE_NOT_CONFIGURED", "Google Sheets credentials are not configured on this deployment.");
  const sp = req.nextUrl.searchParams;
  const headerRow = Number(sp.get("headerRow") ?? 1);
  try {
    return { inspection: await inspectSource({ worksheet: sp.get("worksheet") ?? undefined, headerRow: Number.isInteger(headerRow) && headerRow >= 1 && headerRow <= 200 ? headerRow : 1 }) };
  } catch (err) {
    if (err instanceof SheetsError) throw new AppError("SOURCE_UNAVAILABLE", err.message);
    throw err;
  }
});
