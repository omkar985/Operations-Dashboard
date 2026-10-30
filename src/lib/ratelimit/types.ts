export type RateLimitCategory =
  | "login"
  | "passwordReset"
  | "invitationCreate"
  | "invitationResend"
  | "generalApi"
  | "dataRefresh"
  | "adminMutation";

export interface RateLimitPolicy {
  category: RateLimitCategory;
  max: number;
  windowSeconds: number;
  upstashWindow: `${number} ${"s" | "m" | "h" | "d"}`;
  description: string;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitCategory, RateLimitPolicy> = {
  login: {
    category: "login",
    max: 5,
    windowSeconds: 15 * 60,
    upstashWindow: "15 m",
    description: "Login attempts (5 per 15 minutes)",
  },
  passwordReset: {
    category: "passwordReset",
    max: 3,
    windowSeconds: 15 * 60,
    upstashWindow: "15 m",
    description: "Password reset attempts (3 per 15 minutes)",
  },
  invitationCreate: {
    category: "invitationCreate",
    max: 5,
    windowSeconds: 60 * 60,
    upstashWindow: "1 h",
    description: "Invitation creations (5 per hour)",
  },
  invitationResend: {
    category: "invitationResend",
    max: 3,
    windowSeconds: 15 * 60,
    upstashWindow: "15 m",
    description: "Invitation resends (3 per 15 minutes)",
  },
  generalApi: {
    category: "generalApi",
    max: 120,
    windowSeconds: 60,
    upstashWindow: "1 m",
    description: "General API calls (120 per minute)",
  },
  dataRefresh: {
    category: "dataRefresh",
    max: 5,
    windowSeconds: 5 * 60,
    upstashWindow: "5 m",
    description: "Manual data refresh syncs (5 per 5 minutes)",
  },
  adminMutation: {
    category: "adminMutation",
    max: 30,
    windowSeconds: 60,
    upstashWindow: "1 m",
    description: "Administrative mutations (30 per minute)",
  },
};

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfterSeconds: number;
  category: RateLimitCategory;
}
