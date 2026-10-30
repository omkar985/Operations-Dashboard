import "server-only";
import { db } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import type {
  BeginIdempotencyParams,
  BeginIdempotencyResult,
  FinishIdempotencyParams,
  FailIdempotencyParams,
  CachedResponse,
} from "./types";

/**
 * Centralized, production-ready Idempotency Service backed by Supabase PostgreSQL.
 *
 * Prevents concurrent duplicate execution, replay attacks, duplicate invitations,
 * administrative mutations, and redundant synchronization jobs.
 */

// In-memory store fallback for unit testing environments when Supabase is not reached
interface MemoryIdempotencyRow {
  key: string;
  scope: string;
  userId?: string | null;
  operation: string;
  requestHash: string;
  status: "in_progress" | "completed" | "failed";
  responseStatus?: number | null;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryIdempotencyRow>();
let forceMemoryMode = false;

export function __setIdempotencyForceMemory(enabled: boolean) {
  forceMemoryMode = enabled;
}

export function __resetIdempotencyMemoryStore() {
  memoryStore.clear();
}

const storeKey = (scope: string, key: string) => `${scope}::${key}`;

/**
 * Memory fallback logic for testing or offline execution.
 */
function memoryBeginIdempotency({
  key,
  scope,
  userId,
  operation,
  requestHash,
  leaseSeconds = 120,
  ttlSeconds = 86400,
}: BeginIdempotencyParams): BeginIdempotencyResult {
  const sk = storeKey(scope, key);
  const now = Date.now();
  const leaseCutoff = now - leaseSeconds * 1000;
  const existing = memoryStore.get(sk);

  if (!existing) {
    memoryStore.set(sk, {
      key,
      scope,
      userId,
      operation,
      requestHash,
      status: "in_progress",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    });
    return { action: "execute" };
  }

  // 1. Fingerprint mismatch
  if (existing.requestHash !== requestHash) {
    return { action: "conflict_mismatch" };
  }

  // 2. Completed request -> replay original response
  if (existing.status === "completed") {
    return {
      action: "replay",
      cachedResponse: {
        status: existing.responseStatus || 200,
        headers: existing.responseHeaders || {},
        body: existing.responseBody,
      },
    };
  }

  // 3. In-progress
  if (existing.status === "in_progress") {
    if (existing.updatedAt > leaseCutoff) {
      return { action: "conflict_in_progress" };
    }
    // Lease expired -> reclaim lock
    existing.updatedAt = now;
    existing.status = "in_progress";
    return { action: "execute" };
  }

  // 4. Failed -> allow retry
  existing.updatedAt = now;
  existing.status = "in_progress";
  return { action: "execute" };
}

function memoryFinishIdempotency({
  key,
  scope,
  statusCode,
  headers,
  body,
}: FinishIdempotencyParams): boolean {
  const sk = storeKey(scope, key);
  const existing = memoryStore.get(sk);
  if (existing) {
    existing.status = "completed";
    existing.responseStatus = statusCode;
    existing.responseHeaders = headers || {};
    existing.responseBody = body;
    existing.updatedAt = Date.now();
    return true;
  }
  return false;
}

function memoryFailIdempotency({ key, scope }: FailIdempotencyParams): boolean {
  const sk = storeKey(scope, key);
  const existing = memoryStore.get(sk);
  if (existing) {
    existing.status = "failed";
    existing.updatedAt = Date.now();
    return true;
  }
  return false;
}

/**
 * Claims or checks an idempotency key atomically before executing the handler.
 */
export async function beginIdempotency(
  params: BeginIdempotencyParams
): Promise<BeginIdempotencyResult> {
  if (forceMemoryMode) {
    return memoryBeginIdempotency(params);
  }

  try {
    // 1. Primary: Supabase stored procedure with row-level locks
    const rpcRes = await db().rpc("begin_idempotent_request", {
      p_scope: params.scope,
      p_key: params.key,
      p_user_id: params.userId ?? null,
      p_operation: params.operation,
      p_request_hash: params.requestHash,
      p_lease_seconds: params.leaseSeconds ?? 120,
      p_ttl_seconds: params.ttlSeconds ?? 86400,
    });

    if (!rpcRes.error && rpcRes.data) {
      const row = (Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data) as {
        action: string;
        response_status: number | null;
        response_headers: Record<string, string> | null;
        response_body: unknown;
      };

      let cachedResponse: CachedResponse | undefined;
      if (row.action === "replay" && row.response_status !== null) {
        cachedResponse = {
          status: row.response_status,
          headers: row.response_headers || {},
          body: row.response_body,
        };
      }

      return {
        action: row.action as BeginIdempotencyResult["action"],
        cachedResponse,
      };
    }

    // 2. Direct table fallback if RPC is not yet registered in schema cache
    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - (params.leaseSeconds ?? 120) * 1000);
    const expiresAt = new Date(now.getTime() + (params.ttlSeconds ?? 86400) * 1000);

    const { data: existing, error: selectError } = await db()
      .from("idempotency_keys")
      .select("*")
      .eq("scope", params.scope)
      .eq("key", params.key)
      .maybeSingle();

    if (selectError) {
      // If table doesn't exist in dev/test, fallback to in-memory store
      log.warn("idempotency_table_unavailable_fallback", {
        message: selectError.message,
      });
      return memoryBeginIdempotency(params);
    }

    if (!existing) {
      const { error: insertError } = await db().from("idempotency_keys").insert({
        key: params.key,
        scope: params.scope,
        user_id: params.userId ?? null,
        operation: params.operation,
        request_hash: params.requestHash,
        status: "in_progress",
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

      if (!insertError) {
        return { action: "execute" };
      }
    }

    // Existing row check
    if (existing) {
      if (existing.request_hash !== params.requestHash) {
        return { action: "conflict_mismatch" };
      }

      if (existing.status === "completed") {
        return {
          action: "replay",
          cachedResponse: {
            status: existing.response_status || 200,
            headers: existing.response_headers || {},
            body: existing.response_body,
          },
        };
      }

      if (existing.status === "in_progress") {
        const updatedAt = new Date(existing.updated_at);
        if (updatedAt > leaseCutoff) {
          return { action: "conflict_in_progress" };
        }
      }

      // Reclaim lock
      await db()
        .from("idempotency_keys")
        .update({
          status: "in_progress",
          updated_at: now.toISOString(),
          user_id: params.userId ?? existing.user_id,
          expires_at: expiresAt.toISOString(),
        })
        .eq("scope", params.scope)
        .eq("key", params.key);

      return { action: "execute" };
    }

    return { action: "execute" };
  } catch (err) {
    log.error("idempotency_begin_exception", {
      key: params.key,
      scope: params.scope,
      error: err instanceof Error ? err.message : String(err),
    });
    // Fallback to memory for resilient execution
    return memoryBeginIdempotency(params);
  }
}

/**
 * Marks an idempotent operation as successfully completed and caches the response.
 */
export async function finishIdempotency(
  params: FinishIdempotencyParams
): Promise<void> {
  if (forceMemoryMode) {
    memoryFinishIdempotency(params);
    return;
  }

  try {
    const rpcRes = await db().rpc("finish_idempotent_request", {
      p_scope: params.scope,
      p_key: params.key,
      p_status: params.statusCode,
      p_headers: params.headers || {},
      p_body: params.body,
    });

    if (!rpcRes.error) return;

    // Direct table fallback
    await db()
      .from("idempotency_keys")
      .update({
        status: "completed",
        response_status: params.statusCode,
        response_headers: params.headers || {},
        response_body: params.body,
        updated_at: new Date().toISOString(),
      })
      .eq("scope", params.scope)
      .eq("key", params.key);
  } catch (err) {
    log.error("idempotency_finish_failed", {
      key: params.key,
      scope: params.scope,
      error: err instanceof Error ? err.message : String(err),
    });
    memoryFinishIdempotency(params);
  }
}

/**
 * Marks an idempotent operation as failed so it can be retried cleanly.
 */
export async function failIdempotency(
  params: FailIdempotencyParams
): Promise<void> {
  if (forceMemoryMode) {
    memoryFailIdempotency(params);
    return;
  }

  try {
    const rpcRes = await db().rpc("fail_idempotent_request", {
      p_scope: params.scope,
      p_key: params.key,
      p_error: params.error || null,
    });

    if (!rpcRes.error) return;

    // Direct table fallback
    await db()
      .from("idempotency_keys")
      .update({
        status: "failed",
        response_body: params.error ? { error: params.error } : null,
        updated_at: new Date().toISOString(),
      })
      .eq("scope", params.scope)
      .eq("key", params.key);
  } catch (err) {
    log.warn("idempotency_fail_record_error", {
      key: params.key,
      scope: params.scope,
      error: err instanceof Error ? err.message : String(err),
    });
    memoryFailIdempotency(params);
  }
}

/**
 * Purges expired idempotency keys from the database.
 */
export async function purgeExpiredIdempotencyKeys(
  olderThanSeconds = 86400
): Promise<number> {
  if (forceMemoryMode) {
    const now = Date.now();
    let count = 0;
    for (const [k, v] of memoryStore.entries()) {
      if (v.expiresAt <= now || (v.status !== "in_progress" && now - v.updatedAt >= olderThanSeconds * 1000)) {
        memoryStore.delete(k);
        count++;
      }
    }
    return count;
  }

  try {
    const res = await db().rpc("idempotency_purge", {
      p_older_than_seconds: olderThanSeconds,
    });
    if (!res.error && typeof res.data === "number") {
      return res.data;
    }

    const { data } = await db()
      .from("idempotency_keys")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("id");

    return data?.length ?? 0;
  } catch (err) {
    log.warn("idempotency_purge_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
