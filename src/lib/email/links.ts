/**
 * Builds links that are guaranteed to stay on the configured application origin.
 * Pure (origin is injected) so it can be unit-tested and reused by the proxy.
 */
export function buildAppUrl(origin: string, path: string, params: Record<string, string> = {}): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Link path must be an absolute path on the application origin");
  }
  const base = new URL(origin);
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (url.origin !== base.origin) throw new Error("Refusing to build a link outside the application origin");
  return url.toString();
}

/** True if `candidate` is an http(s) URL on exactly the application origin. */
export function isAppOriginUrl(origin: string, candidate: string): boolean {
  try {
    return new URL(candidate).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
