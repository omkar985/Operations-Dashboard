import { describe, it, expect } from "vitest";
import { signSessionJwt, verifySessionJwt } from "@/lib/auth/jwt-core";

describe("Session JWT Operations", () => {
  const secret = "a-very-long-test-secret-that-is-at-least-32-bytes-long";
  const issuer = "test-issuer";
  const audience = "test-audience";

  it("signs and verifies a valid JWT session token", async () => {
    const claims = {
      sub: crypto.randomUUID(),
      email: "engineer@company.com",
      role: "ADMIN" as const,
      sv: 1,
    };

    const token = await signSessionJwt(claims, 3600, {
      secret,
      issuer,
      audience,
    });

    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const verified = await verifySessionJwt(token, {
      secret,
      issuer,
      audience,
    });

    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(claims.sub);
    expect(verified?.email).toBe(claims.email);
    expect(verified?.role).toBe("ADMIN");
    expect(verified?.sv).toBe(1);
  });

  it("rejects token with wrong secret or tampered payload", async () => {
    const token = await signSessionJwt(
      { sub: crypto.randomUUID(), email: "test@co.com", role: "USER", sv: 1 },
      3600,
      { secret, issuer, audience }
    );

    const verifiedWithWrongSecret = await verifySessionJwt(token, {
      secret: "different-secret-that-is-also-at-least-32-bytes-long",
      issuer,
      audience,
    });

    expect(verifiedWithWrongSecret).toBeNull();

    // Tamper payload
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
    const verifiedTampered = await verifySessionJwt(tampered, {
      secret,
      issuer,
      audience,
    });
    expect(verifiedTampered).toBeNull();
  });

  it("rejects mismatched issuer or audience", async () => {
    const token = await signSessionJwt(
      { sub: crypto.randomUUID(), email: "test@co.com", role: "USER", sv: 1 },
      3600,
      { secret, issuer, audience }
    );

    const wrongIssuer = await verifySessionJwt(token, {
      secret,
      issuer: "wrong-issuer",
      audience,
    });
    expect(wrongIssuer).toBeNull();

    const wrongAudience = await verifySessionJwt(token, {
      secret,
      issuer,
      audience: "wrong-audience",
    });
    expect(wrongAudience).toBeNull();
  });
});
