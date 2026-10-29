import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

let dummy: Promise<string> | undefined;
/**
 * Verifies against a throw-away hash so that "unknown user" and "wrong password" cost the same time,
 * preventing account enumeration through response timing.
 */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummy ??= bcrypt.hash(randomBytes(16).toString("hex"), COST);
  await bcrypt.compare(plain, await dummy);
}

/** 256 bits of CSPRNG output, URL-safe. Only this raw value ever travels in a link. */
export const generateToken = () => randomBytes(32).toString("base64url");

/** Tokens are stored only as SHA-256 digests; a database leak therefore reveals no usable links. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
