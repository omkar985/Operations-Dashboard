import { z } from "zod";
import { FIELD_KEYS } from "@/types/operations";

/** Request / data validation schemas shared by route handlers and client forms. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(254));

const COMMON_PASSWORDS = new Set([
  "password1234", "123456789012", "qwertyuiop12", "administrator1", "welcome12345", "letmein12345", "changeme1234",
]);

/** bcrypt only uses the first 72 BYTES, so longer inputs are rejected rather than silently truncated. */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .refine((p) => new TextEncoder().encode(p).length <= 72, "Use at most 72 bytes (about 72 characters)")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include at least one letter and one number")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "That password is too common");

export const tokenSchema = z.string().trim().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/, "Invalid token");

export const roleSchema = z.enum(["ADMIN", "USER"]);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });

export const acceptInvitationSchema = z.object({
  token: tokenSchema,
  name: z.string().trim().min(1, "Enter your name").max(120),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const createInvitationSchema = z.object({ email: emailSchema, role: roleSchema.default("USER") });

export const updateUserSchema = z
  .object({ role: roleSchema.optional(), isActive: z.boolean().optional() })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, "Nothing to update");

export const uuidSchema = z.uuid();

const header = z.string().trim().min(1).max(200);

export const sheetMappingSchema = z
  .object({
    worksheet: z.string().trim().min(1).max(100),
    headerRow: z.number().int().min(1).max(200),
    dateFormat: z.enum(["ISO", "DMY", "MDY"]),
    columns: z.partialRecord(z.enum(FIELD_KEYS), header),
    completedStatuses: z.array(z.string().trim().min(1).max(100)).max(50),
  })
  .refine((m) => Object.values(m.columns).some(Boolean), {
    message: "Map at least one column",
    path: ["columns"],
  })
  .refine(
    (m) => {
      const used = Object.values(m.columns).map((h) => h?.trim().toLowerCase());
      return new Set(used).size === used.length;
    },
    { message: "Each column can be mapped to only one field", path: ["columns"] },
  );

export const thresholdsSchema = z.object({
  slaTargetPercent: z.number().min(1).max(100),
  ageingDays: z.number().int().min(1).max(3650),
});

export const refreshSettingsSchema = z.object({
  refreshIntervalSeconds: z.number().int().min(15).max(86400),
  cacheTtlSeconds: z.number().int().min(10).max(86400),
});

export const themeSchema = z.enum(["light", "dark", "system"]);

/** Flatten Zod issues into { field: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
