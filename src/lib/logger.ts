import "server-only";

/**
 * Structured (JSON-lines) logger with secret redaction, plus an optional error-monitoring hook.
 * Never log raw tokens, passwords, cookies, private keys or SMTP credentials.
 */

type Level = "debug" | "info" | "warn" | "error";
const REDACT = /pass(word)?|secret|token|authorization|cookie|private|api[-_]?key|service[-_]?role|hash/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: process.env.NODE_ENV === "production" ? undefined : value.stack };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(redact(ctx) as object) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  debug: (m: string, c?: Record<string, unknown>) => process.env.NODE_ENV !== "production" && write("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => write("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => write("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => write("error", m, c),
};

/** Logs and forwards unexpected errors to ERROR_WEBHOOK_URL when configured (best effort, never throws). */
export async function reportError(error: unknown, context: Record<string, unknown> = {}) {
  log.error("unhandled_error", { error, ...context });
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service: "operations-dashboard", message: error instanceof Error ? error.message : String(error), context: redact(context), at: new Date().toISOString() }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* monitoring must never break request handling */
  }
}
