/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminStatus, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminAuthStore } from "./support/admin-auth-store";

const h = vi.hoisted(() => ({
  fake: undefined as any,
  jar: new Map<string, { value: string; options?: any }>(),
  requestHeaders: new Headers(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_target, key) => h.fake.store[key] }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: any) => void h.jar.set(name, { value, options }),
  }),
  headers: async () => h.requestHeaders,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: url }); },
}));

import { changePasswordAction, loginAction, logoutAction } from "../app/admin/auth-actions";
import { INVALID_LOGIN_MESSAGE, THROTTLED_MESSAGE } from "../app/admin/auth-messages";
import { ACCOUNT_ATTEMPT_LIMIT, adminAuthService, createAdminAuthService, LOGIN_WINDOW_MS } from "../lib/auth/admin-auth.service";
import { CREDENTIAL_TRANSACTION_OPTIONS } from "../lib/auth/admin-credential-lock";
import { trustedClientAddress } from "../lib/auth/client-address";
import { sessionCookieName, sessionCookieOptions } from "../lib/auth/cookie";
import { requireAdmin } from "../lib/auth/current-admin";
import { passwordHasher, verifyPassword } from "../lib/auth/password";
import { generateSessionToken, hashSessionToken } from "../lib/auth/session";

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "une toute nouvelle phrase secrète";
const COOKIE = sessionCookieName();
const DAY = 24 * 60 * 60 * 1000;
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const redirectOf = async (promise: Promise<unknown>) => promise.then(() => undefined, (error: any) => { if (!error.redirectTo) throw error; return error.redirectTo as string; });
const codeOf = (promise: Promise<unknown>) => promise.then(() => "OK", (error: any) => error.code ?? error.message);
const passwordChange = (overrides: Record<string, string> = {}) => form({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmation: NEW_PASSWORD, ...overrides });
const admin = () => h.fake.adminByEmail("admin@example.com");

let logged: string[];
beforeEach(async () => {
  h.fake = createAdminAuthStore();
  h.jar.clear();
  h.requestHeaders = new Headers();
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
  await adminAuthService.provisionAdmin({ email: "admin@example.com", name: "Awa Traoré", password: PASSWORD });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function signIn(email = "admin@example.com") {
  expect(await redirectOf(loginAction({}, form({ email, password: PASSWORD })))).toBe("/admin");
  return h.jar.get(COOKIE)!.value;
}

function controlledService() {
  const clock = { now: new Date("2026-10-06T10:00:00.000Z") };
  const passwords = { hash: vi.fn(passwordHasher.hash), verify: vi.fn(passwordHasher.verify), dummyHash: vi.fn(passwordHasher.dummyHash) };
  const service = createAdminAuthService(h.fake.store as PrismaClient, { passwords, now: () => new Date(clock.now) });
  return { service, passwords, clock, advance: (ms: number) => (clock.now = new Date(clock.now.getTime() + ms)) };
}

describe("1–2. login locks without mutating AdminUser and stays race-safe", () => {
  it("leaves AdminUser byte-for-byte unchanged, including updatedAt, on successful login", async () => {
    const before = structuredClone(admin());
    h.fake.operations.length = 0;
    await signIn();
    await signIn();
    expect(admin()).toEqual(before);
    expect(h.fake.operations).not.toContain("adminUser.updateMany");
    expect(h.fake.operations).not.toContain("adminUser.create");
    expect(h.fake.operations.filter((name: string) => name === "adminUser.lockForUpdate")).toHaveLength(2);
  });

  it("locks inside a READ COMMITTED transaction, before the session insert", async () => {
    h.fake.operations.length = 0;
    await signIn();
    const lock = h.fake.operations.indexOf("adminUser.lockForUpdate");
    expect(lock).toBeGreaterThan(-1);
    expect(h.fake.operations.indexOf("adminSession.create")).toBeGreaterThan(lock);
    expect(h.fake.transactionOptions).toContainEqual(CREDENTIAL_TRANSACTION_OPTIONS);
  });

  it("password change committed first: the stale login gets no session and the new hash survives", async () => {
    const { service, passwords } = controlledService();
    const changed = await passwordHasher.hash(NEW_PASSWORD);
    passwords.verify.mockImplementationOnce(async (hash: string, password: string) => {
      const verified = await passwordHasher.verify(hash, password); // verified against the OLD hash…
      admin().passwordHash = changed; // …then another request commits a password change
      return verified;
    });
    expect(await codeOf(service.login({ email: "admin@example.com", password: PASSWORD }))).toBe("INVALID_CREDENTIALS");
    expect(h.fake.sessions()).toEqual([]);
    expect(admin().passwordHash).toBe(changed);
  });

  it("deactivation committed first: the stale login gets no session", async () => {
    const { service, passwords } = controlledService();
    passwords.verify.mockImplementationOnce(async (hash: string, password: string) => { const verified = await passwordHasher.verify(hash, password); admin().status = AdminStatus.INACTIVE; return verified; });
    expect(await codeOf(service.login({ email: "admin@example.com", password: PASSWORD }))).toBe("INVALID_CREDENTIALS");
    expect(h.fake.sessions()).toEqual([]);
  });

  it("login committed first: the following password change revokes the session it created", async () => {
    const token = await signIn();
    expect(await redirectOf(changePasswordAction({}, passwordChange()))).toBe("/admin/login?motDePasse=modifie");
    expect(h.fake.sessions()).toEqual([]);
    expect(await adminAuthService.resolveSession(token)).toBeNull();
  });
});

describe("3. session fixation", () => {
  it("replaces an attacker-planted cookie with fresh session material; the planted value never authenticates", async () => {
    const planted = generateSessionToken();
    h.jar.set(COOKIE, { value: planted });
    const issued = await signIn();
    expect(issued).not.toBe(planted);
    expect(h.fake.sessions().map((session: any) => session.tokenHash)).toEqual([hashSessionToken(issued)]);
    expect(await adminAuthService.resolveSession(planted)).toBeNull();
  });

  it("issues unrelated tokens on every login, even back to back", async () => {
    const tokens = [await signIn(), await signIn(), await signIn()];
    expect(new Set(tokens).size).toBe(3);
    for (const token of tokens) expect(await adminAuthService.resolveSession(token)).toMatchObject({ email: "admin@example.com" });
  });
});

describe("4–5, 10. authorization bypass attempts", () => {
  it.each([
    ["random well-formed token", () => generateSessionToken()],
    ["stored digest used as token", async () => { await signIn(); return h.fake.sessions()[0].tokenHash; }],
    ["oversized garbage", () => "A".repeat(4000)],
    ["SQL-looking token", () => `' OR 1=1 --${"a".repeat(32)}`],
  ])("rejects a forged cookie: %s", async (_label, forge) => {
    const forged = await forge();
    h.jar.clear();
    h.jar.set(COOKIE, { value: forged });
    expect(await redirectOf(requireAdmin())).toBe("/admin/login");
  });

  it("rejects the existing session of an admin deactivated after login", async () => {
    await signIn();
    admin().status = AdminStatus.INACTIVE;
    expect(await redirectOf(requireAdmin())).toBe("/admin/login");
  });

  it("rejects a once-valid session after expiry", async () => {
    await signIn();
    h.fake.sessions()[0].expiresAt = new Date(Date.now() - 1);
    expect(await redirectOf(requireAdmin())).toBe("/admin/login");
  });

  it("direct Server Action invocation with a forged, expired, or inactive-admin session changes nothing", async () => {
    const before = admin().passwordHash;
    h.jar.set(COOKIE, { value: generateSessionToken() });
    expect(await redirectOf(changePasswordAction({}, passwordChange()))).toBe("/admin/login");

    await signIn();
    h.fake.sessions()[0].expiresAt = new Date(Date.now() - 1);
    expect(await redirectOf(changePasswordAction({}, passwordChange()))).toBe("/admin/login");

    await signIn();
    admin().status = AdminStatus.INACTIVE;
    expect(await redirectOf(changePasswordAction({}, passwordChange()))).toBe("/admin/login");
    expect(admin().passwordHash).toBe(before);
  });
});

describe("6–7. password change revocation and atomicity", () => {
  it("revokes every session of that admin and none of another admin's", async () => {
    await adminAuthService.provisionAdmin({ email: "other@example.com", name: "Other", password: PASSWORD });
    const otherToken = await signIn("other@example.com");
    const mine = [await signIn(), await signIn(), await signIn()];
    expect(await redirectOf(changePasswordAction({}, passwordChange()))).toBe("/admin/login?motDePasse=modifie");
    for (const token of mine) expect(await adminAuthService.resolveSession(token)).toBeNull();
    expect(await adminAuthService.resolveSession(otherToken)).toMatchObject({ email: "other@example.com" });
    expect(h.fake.sessions().map((session: any) => session.tokenHash)).toEqual([hashSessionToken(otherToken)]);
  });

  it.each([
    ["the conditional hash update", "adminUser.updateMany"],
    ["the session revocation", "adminSession.deleteMany"],
  ])("a failure at %s preserves the old password and every session", async (_label, operation) => {
    const tokens = [await signIn(), await signIn()];
    const before = admin().passwordHash;
    h.fake.failNext(operation);
    const result = await changePasswordAction({}, passwordChange());
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(admin().passwordHash).toBe(before);
    expect(await verifyPassword(admin().passwordHash, PASSWORD)).toBe(true);
    for (const token of tokens) expect(await adminAuthService.resolveSession(token)).not.toBeNull();
    expect(h.jar.get(COOKIE)!.value).toBe(tokens[1]);
  });

  it("two concurrent password changes: exactly one wins and its hash is the one persisted", async () => {
    const { service, passwords } = controlledService();
    const token = await signIn();
    const winner = await passwordHasher.hash("the winning concurrent passphrase");
    passwords.hash.mockImplementationOnce(async (password: string) => { const hash = await passwordHasher.hash(password); admin().passwordHash = winner; return hash; });
    expect(await codeOf(service.changePassword(token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmation: NEW_PASSWORD }))).toBe("STALE_ADMIN_STATE");
    expect(admin().passwordHash).toBe(winner);
    expect(await verifyPassword(admin().passwordHash, NEW_PASSWORD)).toBe(false);
  });
});

describe("enumeration", () => {
  it("unknown, wrong-password, inactive, and malformed credentials are indistinguishable at the action boundary", async () => {
    await adminAuthService.provisionAdmin({ email: "inactive@example.com", name: "Inactive", password: PASSWORD });
    h.fake.adminByEmail("inactive@example.com").status = AdminStatus.INACTIVE;
    const results = await Promise.all([
      loginAction({}, form({ email: "ghost@example.com", password: PASSWORD })),
      loginAction({}, form({ email: "admin@example.com", password: "wrong password here" })),
      loginAction({}, form({ email: "inactive@example.com", password: PASSWORD })),
      loginAction({}, form({ email: "not-an-email", password: PASSWORD })),
      loginAction({}, form({ email: "admin@example.com", password: "x".repeat(5000) })),
      loginAction({}, form({})),
    ]);
    for (const result of results) expect(result).toEqual({ error: INVALID_LOGIN_MESSAGE });
    expect(h.jar.has(COOKIE)).toBe(false);
  });

  it("unknown, wrong-password, and inactive paths each run exactly one Argon2 verification", async () => {
    const { service, passwords } = controlledService();
    await adminAuthService.provisionAdmin({ email: "inactive@example.com", name: "Inactive", password: PASSWORD });
    h.fake.adminByEmail("inactive@example.com").status = AdminStatus.INACTIVE;
    for (const [email, password] of [["ghost@example.com", PASSWORD], ["admin@example.com", "wrong password here"], ["inactive@example.com", PASSWORD]]) {
      passwords.verify.mockClear();
      expect(await codeOf(service.login({ email, password }))).toBe("INVALID_CREDENTIALS");
      expect(passwords.verify).toHaveBeenCalledTimes(1);
    }
  });
});

describe("8–9. throttling", () => {
  it("cannot be bypassed by casing or whitespace variants of the same email", async () => {
    const { service } = controlledService();
    const variants = ["admin@example.com", "ADMIN@example.com", " Admin@Example.COM ", "\tadmin@EXAMPLE.com\n"];
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT; i++) expect(await codeOf(service.login({ email: variants[i % variants.length], password: "wrong password here" }))).toBe("INVALID_CREDENTIALS");
    for (const variant of variants) expect(await codeOf(service.login({ email: variant, password: PASSWORD }))).toBe("LOGIN_THROTTLED");
  });

  it("parallel attempts cannot slip under the limit: exactly the allowed number reach Argon2", async () => {
    const { service, passwords } = controlledService();
    const results = await Promise.all(Array.from({ length: 3 * ACCOUNT_ATTEMPT_LIMIT }, () => codeOf(service.login({ email: "admin@example.com", password: "wrong password here" }))));
    expect(results.filter(code => code === "INVALID_CREDENTIALS")).toHaveLength(ACCOUNT_ATTEMPT_LIMIT);
    expect(results.filter(code => code === "LOGIN_THROTTLED")).toHaveLength(2 * ACCOUNT_ATTEMPT_LIMIT);
    expect(passwords.verify).toHaveBeenCalledTimes(ACCOUNT_ATTEMPT_LIMIT);
  });

  it("without a trusted proxy header, rotating spoofed X-Forwarded-For values neither bypass nor feed the throttle", async () => {
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT; i++) {
      h.requestHeaders = new Headers({ "x-forwarded-for": `198.51.100.${i}`, "x-real-ip": `203.0.113.${i}` });
      expect(await loginAction({}, form({ email: "admin@example.com", password: "wrong password here" }))).toEqual({ error: INVALID_LOGIN_MESSAGE });
    }
    h.requestHeaders = new Headers({ "x-forwarded-for": "192.0.2.200" });
    expect(await loginAction({}, form({ email: "admin@example.com", password: PASSWORD }))).toEqual({ error: THROTTLED_MESSAGE });
    expect(h.fake.attempts()).toHaveLength(1); // the account key only: no client-address rows were created
  });

  it.each([
    ["header configured but absent", {}],
    ["malformed address", { "x-real-ip": "not-an-ip" }],
    ["address with port", { "x-real-ip": "203.0.113.9:443" }],
    ["empty value", { "x-real-ip": " , " }],
  ])("keeps the account throttle authoritative when the client address is unusable (%s)", async (_label, headers) => {
    vi.stubEnv("ADMIN_CLIENT_IP_HEADER", "x-real-ip");
    h.requestHeaders = new Headers(headers as Record<string, string>);
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT; i++) await loginAction({}, form({ email: "admin@example.com", password: "wrong password here" }));
    expect(await loginAction({}, form({ email: "admin@example.com", password: PASSWORD }))).toEqual({ error: THROTTLED_MESSAGE });
  });

  it("successful login resets only the account counter, not the client-address counter", async () => {
    vi.stubEnv("ADMIN_CLIENT_IP_HEADER", "x-real-ip");
    h.requestHeaders = new Headers({ "x-real-ip": "203.0.113.9" });
    for (let i = 0; i < 3; i++) await loginAction({}, form({ email: "admin@example.com", password: "wrong password here" }));
    await signIn();
    const counts = h.fake.attempts().map((row: any) => row.attempts);
    expect(counts).toEqual([4]); // account row deleted; the client row kept all 4 attempts
  });

  it("window boundary: a fresh window restores the full allowance (fixed-window, at most 2× limit across a boundary)", async () => {
    const { service, clock } = controlledService();
    clock.now = new Date(Date.parse("2026-10-06T10:15:00.000Z") - 1);
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT; i++) await service.login({ email: "admin@example.com", password: "wrong password here" }).catch(() => {});
    expect(await codeOf(service.login({ email: "admin@example.com", password: "wrong password here" }))).toBe("LOGIN_THROTTLED");
    clock.now = new Date("2026-10-06T10:15:00.000Z");
    const nextWindow = [];
    for (let i = 0; i <= ACCOUNT_ATTEMPT_LIMIT; i++) nextWindow.push(await codeOf(service.login({ email: "admin@example.com", password: "wrong password here" })));
    expect(nextWindow.filter(code => code === "INVALID_CREDENTIALS")).toHaveLength(ACCOUNT_ATTEMPT_LIMIT);
    expect(nextWindow.at(-1)).toBe("LOGIN_THROTTLED");
    expect(LOGIN_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe("client address parsing", () => {
  const headers = (value: string) => new Headers({ "x-forwarded-for": value });
  it.each([
    ["untrusted by default", "203.0.113.7", undefined, null],
    ["single trusted IPv4", "203.0.113.7", "x-forwarded-for", "203.0.113.7"],
    ["spoofed prefix ignored; proxy-appended last entry used", "1.2.3.4, 203.0.113.7", "x-forwarded-for", "203.0.113.7"],
    ["IPv4-mapped IPv6 folded to IPv4", "::ffff:203.0.113.7", "x-forwarded-for", "203.0.113.7"],
    ["IPv6 lowercased", "2001:DB8::1", "X-Forwarded-For", "2001:db8::1"],
    ["garbage rejected", "<script>", "x-forwarded-for", null],
    ["port rejected", "203.0.113.7:8080", "x-forwarded-for", null],
    ["bracketed IPv6 rejected", "[2001:db8::1]", "x-forwarded-for", null],
    ["blank header name ignored", "203.0.113.7", "  ", null],
  ])("%s", (_label, value, trusted, expected) => {
    expect(trustedClientAddress(headers(value), trusted)).toBe(expected);
  });
});

describe("session lifecycle attacks", () => {
  it("expiry boundary: valid until the last millisecond, invalid at expiresAt", async () => {
    const { service, advance } = controlledService();
    const { token } = await service.login({ email: "admin@example.com", password: PASSWORD });
    advance(7 * DAY - 1);
    expect(await service.resolveSession(token)).not.toBeNull();
    advance(1);
    expect(await service.resolveSession(token)).toBeNull();
  });

  it("multiple simultaneous sessions are independent: logging one out leaves the others", async () => {
    const [first, second] = [await signIn(), await signIn()];
    h.jar.set(COOKIE, { value: first });
    expect(await redirectOf(logoutAction())).toBe("/admin/login");
    expect(await adminAuthService.resolveSession(first)).toBeNull();
    expect(await adminAuthService.resolveSession(second)).not.toBeNull();
  });

  it("logout when DB revocation fails still clears the cookie and does not report a completed logout", async () => {
    const token = await signIn();
    h.fake.failNext("adminSession.deleteMany");
    await expect(logoutAction()).rejects.toThrow("Injected failure");
    expect(h.jar.get(COOKIE)!.value).toBe("");
    expect(await adminAuthService.resolveSession(token)).not.toBeNull(); // documented: server row survives until expiry
  });

  it("the server session and cookie expire together", async () => {
    await signIn();
    const [session] = h.fake.sessions();
    const { options } = h.jar.get(COOKIE)!;
    expect(options.expires).toEqual(session.expiresAt);
    expect(options.maxAge).toBe(7 * 24 * 60 * 60);
    expect(Math.abs(session.expiresAt.getTime() - (Date.now() + options.maxAge * 1000))).toBeLessThan(5000);
    expect(options).not.toHaveProperty("domain");
  });

  it("raw tokens, passwords, and hashes never reach PostgreSQL rows or logs across every flow", async () => {
    const tokens = [await signIn(), await signIn()];
    await loginAction({}, form({ email: "admin@example.com", password: "wrong password here" }));
    h.fake.store.adminUser.findUnique = async () => { throw new Error(`boom ${PASSWORD}`); };
    await loginAction({}, form({ email: "admin@example.com", password: PASSWORD }));
    const persisted = JSON.stringify({ sessions: h.fake.sessions(), attempts: h.fake.attempts(), admins: h.fake.admins() });
    for (const token of tokens) expect(persisted).not.toContain(token);
    expect(persisted).not.toContain(PASSWORD);
    const output = logged.join("\n");
    for (const secret of [...tokens, PASSWORD, "wrong password here", admin().passwordHash, "admin@example.com"]) expect(output).not.toContain(secret);
  });
});

describe("cookie boundary", () => {
  it("production: __Host-bakanel_session, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain", () => {
    const expiresAt = new Date("2026-10-13T10:00:00.000Z");
    expect(sessionCookieName(true)).toBe("__Host-bakanel_session");
    const options = sessionCookieOptions(expiresAt, true);
    expect(options).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt });
    expect(options).not.toHaveProperty("domain");
  });

  it("development: bakanel_session, HttpOnly, SameSite=Lax, Path=/", () => {
    expect(sessionCookieName(false)).toBe("bakanel_session");
    const options = sessionCookieOptions(new Date(), false);
    expect(options).toMatchObject({ secure: false, httpOnly: true, sameSite: "lax", path: "/" });
    expect(options).not.toHaveProperty("domain");
  });
});
