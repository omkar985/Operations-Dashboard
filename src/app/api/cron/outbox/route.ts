import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/server/http/cron-auth";
import { processDueNotifications } from "@/server/services/notification-service";
import { reportError } from "@/lib/logger";

import { purgeExpiredIdempotencyKeys } from "@/lib/idempotency/service";

export const maxDuration = 60;

/** Flushes due / failed-with-backoff notifications from the outbox and purges expired idempotency keys. */
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    const [outboxResult, purgedKeys] = await Promise.all([
      processDueNotifications(),
      purgeExpiredIdempotencyKeys(86400).catch(() => 0),
    ]);
    return NextResponse.json({ ok: true, ...outboxResult, purgedKeys });
  } catch (err) {
    await reportError(err, { job: "cron.outbox" });
    return NextResponse.json({ ok: false, error: "INTERNAL" }, { status: 500 });
  }
}
