import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/server/http/cron-auth";
import { processDueNotifications } from "@/server/services/notification-service";
import { reportError } from "@/lib/logger";

export const maxDuration = 60;

/** Flushes due / failed-with-backoff notifications from the outbox. */
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, ...(await processDueNotifications()) });
  } catch (err) {
    await reportError(err, { job: "cron.outbox" });
    return NextResponse.json({ ok: false, error: "INTERNAL" }, { status: 500 });
  }
}
