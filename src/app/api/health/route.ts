import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";

/**
 * Liveness + database reachability. Deliberately returns no configuration detail so it is safe to
 * expose to uptime monitors. 200 = healthy, 503 = database unreachable.
 */
export async function GET() {
  let database = false;
  try {
    const res = await db().from("app_settings").select("key", { head: true, count: "exact" }).limit(1);
    database = !res.error;
  } catch {
    database = false;
  }
  return NextResponse.json({ status: database ? "ok" : "degraded", database, time: new Date().toISOString() }, { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
