import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clearedSessionCookieOptions, SESSION_TTL_SECONDS, sessionCookieName, sessionCookieOptions } from "../lib/auth/cookie";
import type { AdminAuthError } from "../lib/auth/errors";
import { getDummyPasswordHash, hashPassword, verifyPassword } from "../lib/auth/password";
import { generateSessionToken, hashSessionToken, hashThrottleKey, isWellFormedSessionToken } from "../lib/auth/session";
import { assertPasswordPolicy, normalizeAdminName, normalizeEmail } from "../lib/auth/validation";

const code = (value: AdminAuthError["code"]) => expect.objectContaining({ name: "AdminAuthError", code: value });

describe("email identity", () => {
  it("trims and lowercases deterministically", () => {
    expect(normalizeEmail(" Admin@Example.com ")).toBe("admin@example.com");
    expect(normalizeEmail("ADMIN@EXAMPLE.COM")).toBe(normalizeEmail("admin@example.com"));
  });

  it.each(["", "   ", "no-at-sign", "two@@example.com", "a b@example.com", `${"a".repeat(250)}@x.io`])("rejects %j", value => {
    expect(() => normalizeEmail(value)).toThrow(code("INVALID_EMAIL"));
  });

  it("requires a non-blank admin name", () => {
    expect(normalizeAdminName("  Awa Traoré ")).toBe("Awa Traoré");
    expect(() => normalizeAdminName("  ")).toThrow(code("INVALID_ADMIN_NAME"));
  });
});

describe("password policy", () => {
  it.each([
    ["exactly 12 characters", "abcdefghijkl"],
    ["a lowercase passphrase with spaces", "correct horse battery staple"],
    ["accented passphrase", "éléphant rose à bicyclette"],
    ["256 code points of emoji", "🔐".repeat(256)],
  ])("accepts %s without composition rules", (_label, password) => {
    expect(() => assertPasswordPolicy(password)).not.toThrow();
  });

  it.each([
    ["11 characters", "abcdefghijk"],
    ["11 emoji (22 UTF-16 units)", "🔐".repeat(11)],
    ["257 characters", "a".repeat(257)],
    ["a very large input", "a".repeat(100_000)],
  ])("rejects %s rather than truncating", (_label, password) => {
    expect(() => assertPasswordPolicy(password)).toThrow(code("INVALID_PASSWORD"));
  });
});

describe("Argon2id password hashing", () => {
  it("stores a salted Argon2id PHC hash with the pinned parameters, never the plaintext", async () => {
    const password = "correct horse battery staple";
    const [first, second] = await Promise.all([hashPassword(password), hashPassword(password)]);
    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(first).not.toContain(password);
    expect(first).not.toBe(second);
  });

  it("verifies the correct password and rejects others, failing closed on malformed hashes", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery stapl")).toBe(false);
    expect(await verifyPassword(hash, "Correct horse battery staple")).toBe(false);
    expect(await verifyPassword("not-a-phc-string", "anything at all")).toBe(false);
  });

  it("uses a cached dummy hash with the same Argon2id parameters", async () => {
    const dummy = await getDummyPasswordHash();
    expect(dummy).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await getDummyPasswordHash()).toBe(dummy);
  });
});

describe("session tokens", () => {
  it("generates 256-bit base64url tokens that never repeat", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateSessionToken));
    expect(tokens.size).toBe(1000);
    for (const token of tokens) expect(isWellFormedSessionToken(token)).toBe(true);
    expect(Buffer.from([...tokens][0], "base64url")).toHaveLength(32);
  });

  it("stores only the SHA-256 digest of the token", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("rejects malformed tokens before any lookup", () => {
    for (const token of [null, undefined, "", "short", `${generateSessionToken()}x`, "a".repeat(42) + "=", "../../etc/passwd".padEnd(43, "a")]) expect(isWellFormedSessionToken(token)).toBe(false);
  });

  it("derives throttle keys as scoped digests, never raw emails or addresses", () => {
    const key = hashThrottleKey("account", "admin@example.com");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toBe(hashThrottleKey("client", "admin@example.com"));
  });
});

describe("session cookie", () => {
  const expiresAt = new Date("2026-10-13T12:00:00.000Z");

  it("is HttpOnly, SameSite=Lax, Path=/, Secure and __Host- prefixed in production", () => {
    expect(sessionCookieName(true)).toBe("__Host-bakanel_session");
    expect(sessionCookieOptions(expiresAt, true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expiresAt, maxAge: SESSION_TTL_SECONDS });
  });

  it("drops Secure (and therefore the __Host- prefix) only outside production", () => {
    expect(sessionCookieName(false)).toBe("bakanel_session");
    expect(sessionCookieOptions(expiresAt, false)).toMatchObject({ httpOnly: true, secure: false, sameSite: "lax", path: "/" });
  });

  it("lives exactly 7 days, matching the server session", () => {
    expect(SESSION_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it("clears with the same scope and an immediate expiry", () => {
    expect(clearedSessionCookieOptions(true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(0), maxAge: 0 });
  });
});
