/** Typed application errors with stable machine-readable codes. Safe to serialise to clients. */

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CSRF_REJECTED"
  | "INVITATION_INVALID"
  | "INVITATION_EXPIRED"
  | "INVITATION_USED"
  | "INVITATION_REVOKED"
  | "EMAIL_TAKEN"
  | "RESET_INVALID"
  | "RESET_EXPIRED"
  | "RESET_USED"
  | "LAST_ADMIN"
  | "SELF_CHANGE_FORBIDDEN"
  | "SYNC_IN_PROGRESS"
  | "SOURCE_NOT_CONFIGURED"
  | "SOURCE_UNAVAILABLE"
  | "MAPPING_INVALID"
  | "EMAIL_NOT_CONFIGURED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CSRF_REJECTED: 403,
  INVITATION_INVALID: 400,
  INVITATION_EXPIRED: 410,
  INVITATION_USED: 410,
  INVITATION_REVOKED: 410,
  EMAIL_TAKEN: 409,
  RESET_INVALID: 400,
  RESET_EXPIRED: 410,
  RESET_USED: 410,
  LAST_ADMIN: 409,
  SELF_CHANGE_FORBIDDEN: 409,
  SYNC_IN_PROGRESS: 409,
  SOURCE_NOT_CONFIGURED: 503,
  SOURCE_UNAVAILABLE: 502,
  MAPPING_INVALID: 422,
  EMAIL_NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/** Database functions raise exceptions whose message is one of our codes. */
export function appErrorFromDbMessage(message: string | undefined, fallback: ErrorCode = "INTERNAL"): AppError {
  const known = (Object.keys(STATUS) as ErrorCode[]).find((c) => message?.includes(c));
  const friendly: Partial<Record<ErrorCode, string>> = {
    INVITATION_INVALID: "This invitation link is not valid.",
    INVITATION_EXPIRED: "This invitation has expired. Ask an administrator to send a new one.",
    INVITATION_USED: "This invitation has already been used.",
    INVITATION_REVOKED: "This invitation has been revoked.",
    EMAIL_TAKEN: "An account with this email already exists.",
    RESET_INVALID: "This password reset link is not valid.",
    RESET_EXPIRED: "This password reset link has expired. Request a new one.",
    RESET_USED: "This password reset link has already been used.",
    LAST_ADMIN: "At least one active administrator must remain.",
    SELF_CHANGE_FORBIDDEN: "You cannot change your own role or deactivate your own account.",
    SYNC_IN_PROGRESS: "A synchronisation is already running.",
    NOT_FOUND: "Not found.",
  };
  if (known) return new AppError(known, friendly[known] ?? known);
  return new AppError(fallback, "Something went wrong.");
}
