/**
 * Client-side idempotency helper.
 * Generates and attaches unique Idempotency-Key headers (RFC / standard UUIDv4).
 */

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Enhanced fetch wrapper that attaches an Idempotency-Key header for mutation requests.
 */
export async function idempotentFetch(
  url: string,
  init?: RequestInit & { idempotencyKey?: string }
): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  const headers = new Headers(init?.headers);
  if (isMutation && !headers.has("Idempotency-Key")) {
    const key = init?.idempotencyKey || createIdempotencyKey();
    headers.set("Idempotency-Key", key);
  }

  return fetch(url, {
    ...init,
    headers,
  });
}
