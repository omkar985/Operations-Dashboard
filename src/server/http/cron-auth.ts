import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { safeEqual } from "@/lib/auth/crypto";

/** Cron endpoints are authenticated with a shared bearer secret (Vercel Cron sends it automatically). */
export function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: { code: "CRON_DISABLED", message: "CRON_SECRET is not configured." } }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }, { status: 401 });
  }
  return null;
}
