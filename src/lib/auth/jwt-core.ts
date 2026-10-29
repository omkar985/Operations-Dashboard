import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

/**
 * Environment-agnostic JWT core (used by the Node runtime via ./jwt.ts and by the proxy).
 * The algorithm is pinned: HS256 only, with mandatory issuer, audience and expiry.
 */

export const JWT_ALG = "HS256" as const;

export interface JwtConfig {
  secret: string;
  issuer: string;
  audience: string;
}

export const sessionClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.string(),
  role: z.enum(["ADMIN", "USER"]),
  sv: z.number().int().positive(),
});
export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSessionJwt(claims: SessionClaims, ttlSeconds: number, cfg: JwtConfig): Promise<string> {
  return new SignJWT({ email: claims.email, role: claims.role, sv: claims.sv })
    .setProtectedHeader({ alg: JWT_ALG, typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(cfg.issuer)
    .setAudience(cfg.audience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .setJti(crypto.randomUUID())
    .sign(key(cfg.secret));
}

/** Returns validated claims, or null for any problem (bad signature, wrong alg/iss/aud, expired, malformed). */
export async function verifySessionJwt(token: string | undefined | null, cfg: JwtConfig): Promise<SessionClaims | null> {
  if (!token || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, key(cfg.secret), {
      algorithms: [JWT_ALG],
      issuer: cfg.issuer,
      audience: cfg.audience,
      requiredClaims: ["exp", "iat", "sub"],
      clockTolerance: 5,
    });
    const parsed = sessionClaimsSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
