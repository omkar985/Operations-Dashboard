import "server-only";
import { createClient, type SupabaseClient, type PostgrestError } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";

/**
 * Service-role Supabase client — SERVER ONLY.
 *
 * Auth model: this application uses its own cookie-based JWT sessions. Supabase Auth is not used,
 * so there is exactly ONE authoritative session system. Supabase is a PostgreSQL database that is
 * only ever reached from route handlers / server components, never from the browser.
 * (@supabase/ssr is deliberately not used: it manages Supabase Auth cookies, which would create
 * the conflicting session state the architecture avoids.)
 */

let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  if (!client) {
    const env = getEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        // Operational data must never be served from Next's fetch cache.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  return client;
}

type Result<T> = { data: T | null; error: PostgrestError | null };

/** Unwraps a PostgREST result; logs the real error server-side and throws a generic AppError. */
export function unwrap<T>(res: Result<T>, context: string): T {
  if (res.error) {
    log.error("db_error", { context, code: res.error.code, message: res.error.message, details: res.error.details });
    throw new AppError("INTERNAL", "A database error occurred.");
  }
  return res.data as T;
}

export function unwrapMaybe<T>(res: Result<T>, context: string): T | null {
  if (res.error) {
    log.error("db_error", { context, code: res.error.code, message: res.error.message });
    throw new AppError("INTERNAL", "A database error occurred.");
  }
  return res.data ?? null;
}
