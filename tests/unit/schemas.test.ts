import { describe, it, expect } from "vitest";
import {
  emailSchema,
  passwordSchema,
  tokenSchema,
  sheetMappingSchema,
  thresholdsSchema,
  refreshSettingsSchema,
} from "@/lib/validation/schemas";

describe("Zod Validation Schemas", () => {
  it("validates and normalizes work emails", () => {
    expect(emailSchema.parse("  USER@Company.COM ")).toBe("user@company.com");
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });

  it("enforces strong passwords and rejects common passwords", () => {
    expect(passwordSchema.parse("StrongPass1234!")).toBe("StrongPass1234!");
    // Too short (< 8)
    expect(() => passwordSchema.parse("Short1!")).toThrow();
    // Missing number
    expect(() => passwordSchema.parse("NoNumbersInThisPassword")).toThrow();
    // Common password
    expect(() => passwordSchema.parse("password1234")).toThrow();
  });

  it("validates token format strictly", () => {
    const validToken = "A".repeat(32);
    expect(tokenSchema.parse(validToken)).toBe(validToken);
    expect(() => tokenSchema.parse("short")).toThrow();
    expect(() => tokenSchema.parse("invalid token with spaces!")).toThrow();
  });

  it("validates sheet mapping configuration", () => {
    const validMapping = {
      worksheet: "Incidents",
      headerRow: 1,
      dateFormat: "DMY",
      columns: {
        id: "Incident ID",
        status: "State",
      },
      completedStatuses: ["Resolved"],
    };

    expect(sheetMappingSchema.parse(validMapping)).toMatchObject(validMapping);
    expect(() =>
      sheetMappingSchema.parse({
        worksheet: "",
        headerRow: 0,
        columns: {},
      })
    ).toThrow();
  });

  it("validates thresholds and refresh bounds", () => {
    expect(thresholdsSchema.parse({ slaTargetPercent: 95, ageingDays: 14 })).toEqual({
      slaTargetPercent: 95,
      ageingDays: 14,
    });
    // Out of bounds
    expect(() => thresholdsSchema.parse({ slaTargetPercent: 120, ageingDays: 7 })).toThrow();

    expect(
      refreshSettingsSchema.parse({ refreshIntervalSeconds: 300, cacheTtlSeconds: 60 })
    ).toEqual({
      refreshIntervalSeconds: 300,
      cacheTtlSeconds: 60,
    });
    // Interval too small
    expect(() =>
      refreshSettingsSchema.parse({ refreshIntervalSeconds: 5, cacheTtlSeconds: 60 })
    ).toThrow();
  });
});
