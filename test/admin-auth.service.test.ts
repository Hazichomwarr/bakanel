/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ACCOUNT_ATTEMPT_LIMIT, CLIENT_ATTEMPT_LIMIT, createAdminAuthService, LOGIN_WINDOW_MS } from "../lib/auth/admin-auth.service";
import type { AdminAuthError } from "../lib/auth/errors";
import { passwordHasher, verifyPassword } from "../lib/auth/password";
import { hashSessionToken } from "../lib/auth/session";
import { createAdminAuthStore } from "./support/admin-auth-store";

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "une toute nouvelle phrase secrète";
const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const fake = createAdminAuthStore();
  const clock = { now: new Date("2026-10-06T10:00:00.000Z") };
  const passwords = { hash: vi.fn(passwordHasher.hash), verify: vi.fn(passwordHasher.verify), dummyHash: vi.fn(passwordHasher.dummyHash) };
  const tokens: string[] = [];
  const service = createAdminAuthService(fake.store as PrismaClient, {
    passwords,
    now: () => new Date(clock.now),
    generateToken: () => { const token = `${"t".repeat(40)}${String(tokens.length).padStart(3, "0")}`; tokens.push(token); return token; },
  });
  const advance = (ms: number) => (clock.now = new Date(clock.now.getTime() + ms));
  return { fake, service, passwords, tokens, advance };
}

async function withAdmin(email = "admin@example.com") {
  const context = setup();
  const admin = await context.service.provisionAdmin({ email, name: "Awa Traoré", password: PASSWORD });
  context.passwords.verify.mockClear();
  context.passwords.hash.mockClear();
  return { ...context, admin };
}

const expectCode = (promise: Promise<unknown>, code: AdminAuthError["code"]) => expect(promise).rejects.toEqual(expect.objectContaining({ name: "AdminAuthError", code }));
const rejectionOf = async (promise: Promise<unknown>) => promise.then(() => { throw new Error("expected rejection"); }, (error: any) => ({ name: error.name, code: error.code, message: error.message }));

describe("admin provisioning", () => {
  it("normalizes the email, stores only an Argon2id hash, and returns no secret material", async () => {
    const { fake, service } = setup();
    const admin = await service.provisionAdmin({ email: " Admin@Example.com ", name: " Awa Traoré ", password: PASSWORD });
    expect(admin).toEqual({ id: expect.any(String), email: "admin@example.com", name: "Awa Traoré" });
    const row = fake.adminByEmail("admin@example.com");
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(fake.admins())).not.toContain(PASSWORD);
  });

  it("refuses a duplicate identity regardless of casing or whitespace", async () => {
    const { fake, service } = await withAdmin();
    await expectCode(service.provisionAdmin({ email: "  ADMIN@example.COM", name: "Other", password: PASSWORD }), "ADMIN_EMAIL_TAKEN");
    expect(fake.admins()).toHaveLength(1);
  });

  it("maps a unique-constraint race on create to ADMIN_EMAIL_TAKEN", async () => {
    const { fake, service } = setup();
    fake.beforeNextWrite(() => void fake.store.adminUser.create({ data: { email: "admin@example.com", name: "Racer", passwordHash: "x" } }));
    await expectCode(service.provisionAdmin({ email: "admin@example.com", name: "Awa", password: PASSWORD }), "ADMIN_EMAIL_TAKEN");
    expect(fake.admins()).toHaveLength(1);
  });

  it("validates policy before hashing or touching the database", async () => {
    const { fake, service, passwords } = setup();
    await expectCode(service.provisionAdmin({ email: "admin@example.com", name: "Awa", password: "too short" }), "INVALID_PASSWORD");
    await expectCode(service.provisionAdmin({ email: "admin@example.com", name: "Awa", password: "x".repeat(257) }), "INVALID_PASSWORD");
    await expectCode(service.provisionAdmin({ email: "nope", name: "Awa", password: PASSWORD }), "INVALID_EMAIL");
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(fake.operations).toEqual([]);
  });
});

describe("login", () => {
  it("issues a 7-day session for valid credentials, storing only the token digest", async () => {
    const { fake, service, admin } = await withAdmin();
    const session = await service.login({ email: " ADMIN@example.com ", password: PASSWORD });
    expect(session.expiresAt).toEqual(new Date(new Date("2026-10-06T10:00:00.000Z").getTime() + 7 * DAY));
    expect(fake.sessions()).toEqual([expect.objectContaining({ adminUserId: admin.id, tokenHash: hashSessionToken(session.token), expiresAt: session.expiresAt })]);
    expect(JSON.stringify(fake.sessions())).not.toContain(session.token);
  });

  it("issues a new, distinct session on every authentication", async () => {
    const { fake, service } = await withAdmin();
    const first = await service.login({ email: "admin@example.com", password: PASSWORD });
    const second = await service.login({ email: "admin@example.com", password: PASSWORD });
    expect(first.token).not.toBe(second.token);
    expect(fake.sessions()).toHaveLength(2);
  });

  it("fails wrong-password, unknown-email, and inactive-account logins identically, creating no session", async () => {
    const { fake, service } = await withAdmin();
    await service.provisionAdmin({ email: "inactive@example.com", name: "Inactive", password: PASSWORD });
    fake.adminByEmail("inactive@example.com").status = AdminStatus.INACTIVE;
    const wrongPassword = await rejectionOf(service.login({ email: "admin@example.com", password: "wrong password here" }));
    const unknownEmail = await rejectionOf(service.login({ email: "ghost@example.com", password: PASSWORD }));
    const inactive = await rejectionOf(service.login({ email: "inactive@example.com", password: PASSWORD }));
    expect(wrongPassword).toEqual({ name: "AdminAuthError", code: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    expect(unknownEmail).toEqual(wrongPassword);
    expect(inactive).toEqual(wrongPassword);
    expect(fake.sessions()).toEqual([]);
  });

  it("performs exactly one Argon2 verification on both the unknown-email and wrong-password paths", async () => {
    const { service, passwords } = await withAdmin();
    const dummy = await passwordHasher.dummyHash();

    await expectCode(service.login({ email: "ghost@example.com", password: PASSWORD }), "INVALID_CREDENTIALS");
    expect(passwords.verify).toHaveBeenCalledTimes(1);
    expect(passwords.verify).toHaveBeenLastCalledWith(dummy, PASSWORD);

    passwords.verify.mockClear();
    await expectCode(service.login({ email: "admin@example.com", password: "wrong password here" }), "INVALID_CREDENTIALS");
    expect(passwords.verify).toHaveBeenCalledTimes(1);
    expect(passwords.verify.mock.calls[0][0]).not.toBe(dummy);
  });

  it("rejects oversized or malformed input generically without hashing work", async () => {
    const { service, passwords } = await withAdmin();
    await expectCode(service.login({ email: "admin@example.com", password: "x".repeat(10_000) }), "INVALID_CREDENTIALS");
    await expectCode(service.login({ email: "not an email", password: PASSWORD }), "INVALID_CREDENTIALS");
    await expectCode(service.login({ email: "admin@example.com", password: "" }), "INVALID_CREDENTIALS");
    expect(passwords.verify).not.toHaveBeenCalled();
  });

  it("loses to a password change that commits between verification and session creation", async () => {
    const { fake, service, passwords } = await withAdmin();
    const changed = await passwordHasher.hash(NEW_PASSWORD);
    passwords.verify.mockImplementationOnce(async (hash: string, password: string) => {
      const verified = await passwordHasher.verify(hash, password);
      fake.adminByEmail("admin@example.com").passwordHash = changed; // committed by another request
      return verified;
    });
    await expectCode(service.login({ email: "admin@example.com", password: PASSWORD }), "INVALID_CREDENTIALS");
    expect(fake.sessions()).toEqual([]);
    expect(fake.adminByEmail("admin@example.com").passwordHash).toBe(changed);
  });

  it("purges the admin's expired sessions when a new one is issued", async () => {
    const { fake, service, advance } = await withAdmin();
    await service.login({ email: "admin@example.com", password: PASSWORD });
    advance(8 * DAY);
    const fresh = await service.login({ email: "admin@example.com", password: PASSWORD });
    expect(fake.sessions().map(session => session.tokenHash)).toEqual([hashSessionToken(fresh.token)]);
  });
});

describe("session resolution", () => {
  it("resolves a valid session to the admin without secret fields", async () => {
    const { service, admin } = await withAdmin();
    const { token } = await service.login({ email: "admin@example.com", password: PASSWORD });
    expect(await service.resolveSession(token)).toEqual({ id: admin.id, email: "admin@example.com", name: "Awa Traoré" });
  });

  it("rejects missing, malformed, and unknown tokens; malformed ones without a lookup", async () => {
    const { fake, service } = await withAdmin();
    await service.login({ email: "admin@example.com", password: PASSWORD });
    fake.operations.length = 0;
    expect(await service.resolveSession(undefined)).toBeNull();
    expect(await service.resolveSession("")).toBeNull();
    expect(await service.resolveSession("not-a-token")).toBeNull();
    expect(fake.operations).toEqual([]);
    expect(await service.resolveSession("u".repeat(43))).toBeNull();
  });

  it("never accepts the stored digest itself as a token", async () => {
    const { fake, service } = await withAdmin();
    await service.login({ email: "admin@example.com", password: PASSWORD });
    expect(await service.resolveSession(fake.sessions()[0].tokenHash)).toBeNull();
  });

  it("rejects a session at and after its expiry instant even though the cookie still exists", async () => {
    const { service, advance } = await withAdmin();
    const { token } = await service.login({ email: "admin@example.com", password: PASSWORD });
    advance(7 * DAY - 1);
    expect(await service.resolveSession(token)).not.toBeNull();
    advance(1);
    expect(await service.resolveSession(token)).toBeNull();
  });

  it("rejects a deleted session, an inactive admin, and a session whose admin row is gone", async () => {
    const { fake, service, admin } = await withAdmin();
    const deleted = await service.login({ email: "admin@example.com", password: PASSWORD });
    await fake.store.adminSession.deleteMany({ where: { tokenHash: hashSessionToken(deleted.token) } });
    expect(await service.resolveSession(deleted.token)).toBeNull();

    const inactive = await service.login({ email: "admin@example.com", password: PASSWORD });
    fake.adminByEmail("admin@example.com").status = AdminStatus.INACTIVE;
    expect(await service.resolveSession(inactive.token)).toBeNull();

    fake.adminByEmail("admin@example.com").status = AdminStatus.ACTIVE;
    const orphan = await service.login({ email: "admin@example.com", password: PASSWORD });
    fake.deleteAdminRowOnly(admin.id);
    expect(await service.resolveSession(orphan.token)).toBeNull();
  });
});

describe("logout", () => {
  it("revokes only the current server-side session", async () => {
    const { fake, service } = await withAdmin();
    const current = await service.login({ email: "admin@example.com", password: PASSWORD });
    const other = await service.login({ email: "admin@example.com", password: PASSWORD });
    await service.logout(current.token);
    expect(await service.resolveSession(current.token)).toBeNull();
    expect(await service.resolveSession(other.token)).not.toBeNull();
    expect(fake.admins()).toHaveLength(1);
  });

  it("is a safe no-op for already-revoked, unknown, or missing tokens", async () => {
    const { service } = await withAdmin();
    const { token } = await service.login({ email: "admin@example.com", password: PASSWORD });
    await service.logout(token);
    await expect(service.logout(token)).resolves.toBeUndefined();
    await expect(service.logout("garbage")).resolves.toBeUndefined();
    await expect(service.logout(null)).resolves.toBeUndefined();
  });
});

describe("password change", () => {
  async function loggedIn() {
    const context = await withAdmin();
    const current = await context.service.login({ email: "admin@example.com", password: PASSWORD });
    const other = await context.service.login({ email: "admin@example.com", password: PASSWORD });
    return { ...context, current, other };
  }
  const change = (overrides: Partial<{ currentPassword: string; newPassword: string; confirmation: string }> = {}) => ({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmation: NEW_PASSWORD, ...overrides });

  it("requires an authenticated session", async () => {
    const { service, current } = await loggedIn();
    await expectCode(service.changePassword(null, change()), "UNAUTHENTICATED");
    await service.logout(current.token);
    await expectCode(service.changePassword(current.token, change()), "UNAUTHENTICATED");
  });

  it.each([
    ["a wrong current password", { currentPassword: "not my password" }, "INVALID_CURRENT_PASSWORD"],
    ["an oversized current password", { currentPassword: "x".repeat(300) }, "INVALID_CURRENT_PASSWORD"],
    ["a mismatched confirmation", { confirmation: `${NEW_PASSWORD}!` }, "PASSWORD_CONFIRMATION_MISMATCH"],
    ["a weak new password", { newPassword: "short", confirmation: "short" }, "INVALID_PASSWORD"],
    ["an oversized new password", { newPassword: "y".repeat(257), confirmation: "y".repeat(257) }, "INVALID_PASSWORD"],
  ] as const)("rejects %s and changes nothing", async (_label, overrides, expected) => {
    const { fake, service, current, other } = await loggedIn();
    const before = fake.adminByEmail("admin@example.com").passwordHash;
    await expectCode(service.changePassword(current.token, change(overrides)), expected);
    expect(fake.adminByEmail("admin@example.com").passwordHash).toBe(before);
    expect(await service.resolveSession(current.token)).not.toBeNull();
    expect(await service.resolveSession(other.token)).not.toBeNull();
  });

  it("stores a new Argon2id hash, retires the old password, and revokes every session", async () => {
    const { fake, service, current, other } = await loggedIn();
    const before = fake.adminByEmail("admin@example.com").passwordHash;
    await service.changePassword(current.token, change());
    const after = fake.adminByEmail("admin@example.com").passwordHash;
    expect(after).toMatch(/^\$argon2id\$/);
    expect(after).not.toBe(before);
    expect(await verifyPassword(after, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(after, PASSWORD)).toBe(false);
    expect(fake.sessions()).toEqual([]);
    expect(await service.resolveSession(current.token)).toBeNull();
    expect(await service.resolveSession(other.token)).toBeNull();
    await expectCode(service.login({ email: "admin@example.com", password: PASSWORD }), "INVALID_CREDENTIALS");
    await expect(service.login({ email: "admin@example.com", password: NEW_PASSWORD })).resolves.toBeTruthy();
  });

  it("cannot report success when session revocation fails: the hash update rolls back with it", async () => {
    const { fake, service, current, other } = await loggedIn();
    const before = fake.adminByEmail("admin@example.com").passwordHash;
    let revocations = 0;
    const original = fake.store.adminSession.deleteMany;
    fake.store.adminSession.deleteMany = async (args: any) => {
      if (args.where.adminUserId && !args.where.expiresAt && revocations++ === 0) throw new Error("connection lost");
      return original(args);
    };
    await expect(service.changePassword(current.token, change())).rejects.toThrow("connection lost");
    expect(fake.adminByEmail("admin@example.com").passwordHash).toBe(before);
    expect(await service.resolveSession(current.token)).not.toBeNull();
    expect(await service.resolveSession(other.token)).not.toBeNull();
  });

  it("loses to a concurrent password change instead of overwriting it", async () => {
    const { fake, service, passwords, current } = await loggedIn();
    const competing = await passwordHasher.hash("a competing new passphrase");
    passwords.hash.mockImplementationOnce(async (password: string) => {
      const hash = await passwordHasher.hash(password);
      fake.adminByEmail("admin@example.com").passwordHash = competing; // committed by another request
      return hash;
    });
    await expectCode(service.changePassword(current.token, change()), "STALE_ADMIN_STATE");
    expect(fake.adminByEmail("admin@example.com").passwordHash).toBe(competing);
  });
});

describe("login throttling", () => {
  const attempt = (service: any, email: string, password: string, clientAddress: string | null = "203.0.113.7") => rejectionOf(service.login({ email, password, clientAddress })).catch(() => ({ code: "OK" }));

  it(`limits attempts per submitted email to ${ACCOUNT_ATTEMPT_LIMIT} per window, even with the correct password`, async () => {
    const { fake, service, passwords } = await withAdmin();
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT; i++) expect((await attempt(service, "admin@example.com", "wrong password here", `198.51.100.${i}`)).code).toBe("INVALID_CREDENTIALS");
    passwords.verify.mockClear();
    expect((await attempt(service, "admin@example.com", PASSWORD, "192.0.2.1")).code).toBe("LOGIN_THROTTLED");
    expect(passwords.verify).not.toHaveBeenCalled();
    expect(fake.sessions()).toEqual([]);
  });

  it("throttles unknown and existing emails identically, so throttling reveals nothing", async () => {
    const { service } = await withAdmin();
    const outcomes = async (email: string) => {
      const codes = [];
      for (let i = 0; i <= ACCOUNT_ATTEMPT_LIMIT; i++) codes.push((await rejectionOf(service.login({ email, password: "wrong password here", clientAddress: null }))).code);
      return codes;
    };
    const existing = await outcomes("admin@example.com");
    expect(await outcomes("ghost@example.com")).toEqual(existing);
    expect(existing.at(-1)).toBe("LOGIN_THROTTLED");
  });

  it("resets the account counter on successful login", async () => {
    const { service } = await withAdmin();
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT - 1; i++) await attempt(service, "admin@example.com", "wrong password here", null);
    await service.login({ email: "admin@example.com", password: PASSWORD });
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT - 1; i++) expect((await attempt(service, "admin@example.com", "wrong password here", null)).code).toBe("INVALID_CREDENTIALS");
    await expect(service.login({ email: "admin@example.com", password: PASSWORD })).resolves.toBeTruthy();
  });

  it("never locks permanently: the next window accepts the legitimate admin and stale counters are purged", async () => {
    const { fake, service, advance } = await withAdmin();
    for (let i = 0; i <= ACCOUNT_ATTEMPT_LIMIT; i++) await attempt(service, "admin@example.com", "wrong password here", null);
    expect((await attempt(service, "admin@example.com", PASSWORD, null)).code).toBe("LOGIN_THROTTLED");
    advance(LOGIN_WINDOW_MS);
    await expect(service.login({ email: "admin@example.com", password: PASSWORD })).resolves.toBeTruthy();
    expect(fake.attempts().every(row => row.windowStart.getTime() >= Math.floor(Date.parse("2026-10-06T10:15:00.000Z") / LOGIN_WINDOW_MS) * LOGIN_WINDOW_MS)).toBe(true);
  });

  it(`limits password spraying from one client address to ${CLIENT_ATTEMPT_LIMIT} attempts per window`, async () => {
    const { service } = await withAdmin();
    for (let i = 0; i < CLIENT_ATTEMPT_LIMIT; i++) expect((await attempt(service, `user${i}@example.com`, "wrong password here")).code).toBe("INVALID_CREDENTIALS");
    expect((await attempt(service, "admin@example.com", PASSWORD)).code).toBe("LOGIN_THROTTLED");
    await expect(service.login({ email: "admin@example.com", password: PASSWORD, clientAddress: "192.0.2.99" })).resolves.toBeTruthy();
  });

  it("stores only digests of throttle keys", async () => {
    const { fake, service } = await withAdmin();
    await attempt(service, "admin@example.com", "wrong password here", "203.0.113.7");
    const persisted = JSON.stringify(fake.attempts());
    expect(persisted).not.toContain("admin@example.com");
    expect(persisted).not.toContain("203.0.113.7");
  });

  it("also bounds current-password guessing through password change", async () => {
    const { service } = await withAdmin();
    const { token } = await service.login({ email: "admin@example.com", password: PASSWORD });
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT; i++) await expectCode(service.changePassword(token, { currentPassword: `guess number ${i}`, newPassword: NEW_PASSWORD, confirmation: NEW_PASSWORD }), "INVALID_CURRENT_PASSWORD");
    await expectCode(service.changePassword(token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmation: NEW_PASSWORD }), "LOGIN_THROTTLED");
  });
});
