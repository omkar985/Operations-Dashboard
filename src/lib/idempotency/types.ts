export type IdempotencyAction =
  | "execute"
  | "replay"
  | "conflict_mismatch"
  | "conflict_in_progress";

export interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface BeginIdempotencyResult {
  action: IdempotencyAction;
  cachedResponse?: CachedResponse;
}

export interface BeginIdempotencyParams {
  key: string;
  scope: string;
  userId?: string | null;
  operation: string;
  requestHash: string;
  leaseSeconds?: number;
  ttlSeconds?: number;
}

export interface FinishIdempotencyParams {
  key: string;
  scope: string;
  statusCode: number;
  headers?: Record<string, string>;
  body: unknown;
}

export interface FailIdempotencyParams {
  key: string;
  scope: string;
  error?: string;
}
