import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/server/http/cron-auth";
import { housekeeping, runSync } from "@/server/services/sync-service";
import { isAppError } from "@/lib/errors";
import { reportError } from "@/lib/logger";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    const summary = await runSync({ trigger: "cron" });
    await housekeeping();
    return NextResponse.json({ ok: true, rows: summary.rowsValid, warnings: summary.warnings.length });
  } catch (err) {
    // Expected, non-fatal states are reported with 200 so schedulers don't treat them as outages.
    if (isAppError(err) && (err.code === "SYNC_IN_PROGRESS" || err.code === "SOURCE_NOT_CONFIGURED")) {
      return NextResponse.json({ ok: false, skipped: err.code });
    }
    if (isAppError(err)) return NextResponse.json({ ok: false, error: err.code }, { status: 502 });
    await reportError(err, { job: "cron.sync" });
    return NextResponse.json({ ok: false, error: "INTERNAL" }, { status: 500 });
  }
}
