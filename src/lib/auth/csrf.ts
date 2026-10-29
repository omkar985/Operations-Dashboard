/** CSRF defence for cookie-authenticated state-changing requests.
 *
 * Layers: SameSite=Lax session cookie  +  strict Origin / Fetch-Metadata validation here
 *         +  JSON-only bodies (a cross-site <form> cannot send application/json).
 * Pure function so the proxy, route handlers and unit tests share one implementation.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfInput {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  appOrigin: string;
  isProd: boolean;
}

export function isRequestSameOrigin(i: CsrfInput): boolean {
  if (SAFE_METHODS.has(i.method.toUpperCase())) return true;

  if (i.origin) {
    if (i.origin === i.appOrigin) return true;
    // Dev convenience (e.g. dev server on another port): same Host header is accepted, never in production.
    if (!i.isProd && i.host) {
      try {
        return new URL(i.origin).host === i.host;
      } catch {
        return false;
      }
    }
    return false;
  }

  // No Origin header (rare for fetch/XHR POSTs): fall back to Fetch Metadata.
  return i.secFetchSite === "same-origin" || i.secFetchSite === "none";
}
