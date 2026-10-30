import "server-only";
import { z } from "zod";

/**
 * Validated, typed environment. Parsing is lazy + memoised and also executed at server
 * start-up (src/instrumentation.ts) so a misconfigured deployment fails fast and loudly.
 * Only variable NAMES are ever reported — never values.
 */

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(blank, s.optional());
const withDefault = <T extends z.ZodType>(s: T, d: z.input<T>) => z.preprocess(blank, s.default(d as never));

const intIn = (min: number, max: number) =>
  z.preprocess(blank, z.coerce.number().int().min(min).max(max));

const serverSchema = z.object({
  NODE_ENV: withDefault(z.enum(["development", "test", "production"]), "development"),
  APP_URL: z.url({ protocol: /^https?$/ }),

  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_ISSUER: withDefault(z.string().min(1), "operations-dashboard"),
  JWT_AUDIENCE: withDefault(z.string().min(1), "operations-dashboard-web"),
  SESSION_TTL_HOURS: withDefault(intIn(1, 24 * 30), 8),
  INVITATION_TTL_HOURS: withDefault(intIn(1, 24 * 30), 72),
  PASSWORD_RESET_TTL_MINUTES: withDefault(intIn(5, 24 * 60), 60),

  GOOGLE_SHEETS_SPREADSHEET_ID: opt(z.string().min(10)),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: opt(z.email()),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: opt(z.string().min(100)),

  SMTP_HOST: opt(z.string().min(1)),
  SMTP_PORT: withDefault(intIn(1, 65535), 587),
  SMTP_SECURE: withDefault(z.enum(["true", "false"]), "false"),
  SMTP_USER: opt(z.string().min(1)),
  SMTP_PASSWORD: opt(z.string().min(1)),
  EMAIL_FROM: opt(z.string().min(3)),

  DATA_CACHE_TTL_SECONDS: withDefault(intIn(10, 86400), 120),
  AUTO_REFRESH_INTERVAL_SECONDS: withDefault(intIn(15, 86400), 120),

  CRON_SECRET: opt(z.string().min(16)),
  ERROR_WEBHOOK_URL: opt(z.url()),

  UPSTASH_REDIS_REST_URL: opt(z.url()),
  UPSTASH_REDIS_REST_TOKEN: opt(z.string().min(10)),
  RATE_LIMIT_FAIL_CLOSED: withDefault(z.enum(["true", "false"]), "true"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n - ${problems.join("\n - ")}`);
    this.name = "EnvError";
  }
}

let cached: ServerEnv | undefined;

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new EnvError(problems);
  }
  const env = parsed.data;
  const problems: string[] = [];

  if (env.NODE_ENV === "production") {
    if (!env.APP_URL.startsWith("https://")) problems.push("APP_URL: must use https in production");
    if (/^(change|replace|secret|password|dev)/i.test(env.JWT_SECRET)) {
      problems.push("JWT_SECRET: looks like a placeholder");
    }
  }
  const smtpKeys = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const;
  const smtpSet = smtpKeys.filter((k) => env[k]);
  if (smtpSet.length > 0 && smtpSet.length < smtpKeys.length) {
    if (env.NODE_ENV === "production") {
      problems.push(`SMTP: partially configured — also set ${smtpKeys.filter((k) => !env[k]).join(", ")}`);
    }
  }
  const sheetKeys = [
    "GOOGLE_SHEETS_SPREADSHEET_ID",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  ] as const;
  const sheetSet = sheetKeys.filter((k) => env[k]);
  if (sheetSet.length > 0 && sheetSet.length < sheetKeys.length) {
    if (env.NODE_ENV === "production") {
      problems.push(`Google Sheets: partially configured — also set ${sheetKeys.filter((k) => !env[k]).join(", ")}`);
    }
  }
  if (problems.length) throw new EnvError(problems);
  return env;
}

export function getEnv(): ServerEnv {
  if (!cached) cached = parseEnv(process.env as Record<string, string | undefined>);
  return cached;
}

/** Reset memoised env — tests only. */
export function __resetEnvForTests() {
  cached = undefined;
}

export interface SheetsConfig {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
}

/** Returns null when Google Sheets is not configured (the app then shows a connection state). */
export function getSheetsConfig(): SheetsConfig | null {
  const e = getEnv();
  if (!e.GOOGLE_SHEETS_SPREADSHEET_ID || !e.GOOGLE_SERVICE_ACCOUNT_EMAIL || !e.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return null;
  }
  return {
    spreadsheetId: e.GOOGLE_SHEETS_SPREADSHEET_ID,
    clientEmail: e.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // .env files commonly hold the PEM with literal "\n" sequences and surrounding quotes.
    privateKey: e.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
  };
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

/** Returns null when SMTP is not configured (emails are then queued as failed with a clear reason). */
export function getSmtpConfig(): SmtpConfig | null {
  const e = getEnv();
  if (!e.SMTP_HOST || !e.SMTP_USER || !e.SMTP_PASSWORD || !e.EMAIL_FROM) return null;
  return {
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE === "true",
    user: e.SMTP_USER,
    password: e.SMTP_PASSWORD,
    from: e.EMAIL_FROM,
  };
}

export interface UpstashConfig {
  url: string;
  token: string;
}

/** Returns null when Upstash Redis is not configured (rate limiting falls back to durable Postgres storage). */
export function getUpstashConfig(): UpstashConfig | null {
  const e = getEnv();
  if (!e.UPSTASH_REDIS_REST_URL || !e.UPSTASH_REDIS_REST_TOKEN) return null;
  return {
    url: e.UPSTASH_REDIS_REST_URL,
    token: e.UPSTASH_REDIS_REST_TOKEN,
  };
}

export const isRateLimitFailClosed = () => getEnv().RATE_LIMIT_FAIL_CLOSED === "true";

export const appOrigin = () => new URL(getEnv().APP_URL).origin;
export const isProduction = () => getEnv().NODE_ENV === "production";
