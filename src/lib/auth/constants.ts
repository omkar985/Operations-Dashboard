/** Auth constants shared by the Node runtime and the proxy. No server-only imports here. */

export const SESSION_COOKIE_DEV = "od_session";
/** `__Host-` prefix: Secure, Path=/, no Domain — the browser enforces it can't be overwritten by subdomains. */
export const SESSION_COOKIE_PROD = "__Host-od_session";

export const sessionCookieName = (isProd: boolean) => (isProd ? SESSION_COOKIE_PROD : SESSION_COOKIE_DEV);

export const THEME_COOKIE = "od-theme";

export const PROTECTED_PREFIXES = ["/dashboard", "/operations", "/reports", "/settings", "/admin"] as const;
export const AUTH_PAGES = ["/login", "/forgot-password", "/reset-password", "/accept-invitation"] as const;

/**
 * Open-redirect-safe `next` handling: only same-site absolute paths into protected areas are accepted.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  const path = value.split(/[?#]/)[0];
  const ok = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  return ok ? value : fallback;
}
