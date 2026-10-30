import { createHash } from "node:crypto";

/**
 * Recursively canonicalizes JSON data by sorting object keys alphabetically.
 * Ensures consistent serialization regardless of key ordering.
 */
export function canonicalJsonString(data: unknown): string {
  if (data === null || data === undefined) {
    return "";
  }

  if (typeof data !== "object") {
    return JSON.stringify(data);
  }

  if (Array.isArray(data)) {
    return `[${data.map((item) => canonicalJsonString(item)).join(",")}]`;
  }

  const obj = data as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJsonString(obj[key])}`
  );
  return `{${pairs.join(",")}}`;
}

export interface ComputeFingerprintParams {
  method: string;
  pathname: string;
  searchParams?: URLSearchParams | Record<string, string>;
  body?: unknown;
}

/**
 * Computes a SHA-256 fingerprint from the canonical request signature.
 */
export function computeRequestFingerprint({
  method,
  pathname,
  searchParams,
  body,
}: ComputeFingerprintParams): string {
  let queryString = "";
  if (searchParams) {
    if (searchParams instanceof URLSearchParams) {
      const sorted = new URLSearchParams(searchParams);
      sorted.sort();
      queryString = sorted.toString();
    } else {
      const sortedKeys = Object.keys(searchParams).sort();
      queryString = sortedKeys
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(searchParams[k] || "")}`)
        .join("&");
    }
  }

  const canonicalBody = canonicalJsonString(body);
  const rawSignature = `${method.toUpperCase()}:${pathname}:${queryString}:${canonicalBody}`;

  return createHash("sha256").update(rawSignature).digest("hex");
}
