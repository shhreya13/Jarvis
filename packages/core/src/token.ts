import crypto from "node:crypto";
import fs from "node:fs";
import { ensureDirs, tokenPath } from "./paths.js";

/** Generates and persists a fresh gateway bearer token (mode 0600). */
export function generateToken(): string {
  ensureDirs();
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(tokenPath(), `${token}\n`, { mode: 0o600 });
  return token;
}

export function readToken(): string | undefined {
  const file = tokenPath();
  if (!fs.existsSync(file)) return undefined;
  const token = fs.readFileSync(file, "utf8").trim();
  return token.length > 0 ? token : undefined;
}

/** Returns the existing token, generating one on first use. */
export function requireToken(): string {
  return readToken() ?? generateToken();
}

/** Constant-time comparison for auth middleware. */
export function verifyToken(candidate: string): boolean {
  const expected = readToken();
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
