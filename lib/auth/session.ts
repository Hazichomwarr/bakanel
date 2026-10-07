import "server-only";
import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 256 bits from the OS CSPRNG, base64url-encoded. Exists only in the browser cookie. */
export function generateSessionToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export const isWellFormedSessionToken = (token: string | null | undefined): token is string => typeof token === "string" && TOKEN_PATTERN.test(token);

/** SHA-256 is sufficient for a 256-bit random token: no secret pepper is needed for database lookup. */
export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Throttle keys are digests so submitted emails and client addresses are not stored verbatim. */
export function hashThrottleKey(scope: "account" | "client", value: string) {
  return createHash("sha256").update(`admin-login:${scope}:${value}`).digest("hex");
}
