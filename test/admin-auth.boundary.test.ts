/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { INVALID_LOGIN_MESSAGE, PASSWORD_CHANGED_PATH, THROTTLED_MESSAGE, UNAVAILABLE_MESSAGE } from "../app/admin/auth-messages";
import AdminLoginPage from "../app/admin/login/page";
import AdminWorkspaceLayout from "../app/admin/(workspace)/layout";
import { config as proxyConfig, proxy } from "../proxy";
import { ACCOUNT_ATTEMPT_LIMIT, adminAuthService, CLIENT_ATTEMPT_LIMIT } from "../lib/auth/admin-auth.service";
import { sessionCookieName } from "../lib/auth/cookie";
import { getCurrentAdmin, requireAdmin } from "../lib/auth/current-admin";
import { hashSessionToken } from "../lib/auth/session";

const PASSWORD = "correct horse battery staple";
const COOKIE = sessionCookieName();
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const redirectOf = async (promise: Promise<unknown>) => promise.then(() => undefined, (error: any) => { if (!error.redirectTo) throw error; return error.redirectTo as string; });
const cookieValue = () => h.jar.get(COOKIE)?.value;
const protectedWorkspace = () => AdminWorkspaceLayout({ children: createElement("p", undefined, "Contenu protégé") } as never);

beforeEach(async () => {
  h.fake = createAdminAuthStore();
  h.jar.clear();
  h.requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
  await adminAuthService.provisionAdmin({ email: "admin@example.com", name: "Awa Traoré", password: PASSWORD });
});

async function signIn() {
  expect(await redirectOf(loginAction({}, form({ email: "admin@example.com", password: PASSWORD })))).toBe("/admin");
  return cookieValue()!;
}

describe("proxy (optimistic early redirect)", () => {
  const request = (path: string, cookie?: string) => new NextRequest(`https://bakanel.test${path}`, { headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {} });

  it.each(["/admin", "/admin/compte", "/admin/anything/deeper", "/admin/login-elsewhere"])("redirects %s to login without a session cookie", path => {
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://bakanel.test/admin/login");
  });

  it("lets the login page through unauthenticated", () => {
    expect(proxy(request("/admin/login")).headers.get("location")).toBeNull();
  });

  it("only checks cookie presence, which is why pages re-check authoritatively", async () => {
    expect(proxy(request("/admin", "forged-cookie-value")).headers.get("location")).toBeNull();
    h.jar.set(COOKIE, { value: "forged-cookie-value" });
    expect(await redirectOf(protectedWorkspace())).toBe("/admin/login");
  });

  it("is scoped to the admin area", () => {
    expect(proxyConfig.matcher).toEqual(["/admin", "/admin/:path*"]);
  });
});

describe("authoritative server-side guard", () => {
  it("rejects missing, forged, and revoked sessions", async () => {
    expect(await getCurrentAdmin()).toBeNull();
    expect(await redirectOf(requireAdmin())).toBe("/admin/login");
    h.jar.set(COOKIE, { value: "x".repeat(43) });
    expect(await redirectOf(requireAdmin())).toBe("/admin/login");
    const token = await signIn();
    await h.fake.store.adminSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    expect(await redirectOf(requireAdmin())).toBe("/admin/login");
  });

  it("protects every workspace route server-side through its nested layout, independently of the proxy", async () => {
    expect(await redirectOf(protectedWorkspace())).toBe("/admin/login");
  });

  it("admits an authenticated admin", async () => {
    await signIn();
    expect(await requireAdmin()).toMatchObject({ email: "admin@example.com" });
    await expect(protectedWorkspace()).resolves.toBeTruthy();
  });

  it("keeps the login page public, and sends authenticated admins to /admin", async () => {
    await expect(AdminLoginPage({ searchParams: Promise.resolve({}) } as any)).resolves.toBeTruthy();
    await signIn();
    expect(await redirectOf(AdminLoginPage({ searchParams: Promise.resolve({}) } as any))).toBe("/admin");
  });
});

describe("login action", () => {
  it("sets a secure opaque cookie whose digest matches the stored session, then redirects to /admin", async () => {
    const token = await signIn();
    expect(h.jar.get(COOKIE)!.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h.fake.sessions()).toEqual([expect.objectContaining({ tokenHash: hashSessionToken(token) })]);
    expect(token).not.toContain("admin@example.com");
  });

  it("ignores any caller-supplied return URL", async () => {
    const destination = await redirectOf(loginAction({}, form({ email: "admin@example.com", password: PASSWORD, next: "https://evil.example/phish", redirectTo: "//evil.example" })));
    expect(destination).toBe("/admin");
  });

  it("returns one identical generic message for wrong password and unknown email, without a cookie", async () => {
    const wrongPassword = await loginAction({}, form({ email: "admin@example.com", password: "wrong password here" }));
    const unknownEmail = await loginAction({}, form({ email: "ghost@example.com", password: PASSWORD }));
    const missingFields = await loginAction({}, form({}));
    expect(wrongPassword).toEqual({ error: INVALID_LOGIN_MESSAGE });
    expect(unknownEmail).toEqual(wrongPassword);
    expect(missingFields).toEqual(wrongPassword);
    expect(INVALID_LOGIN_MESSAGE).toBe("Email ou mot de passe incorrect.");
    expect(h.jar.has(COOKIE)).toBe(false);
    expect(h.fake.sessions()).toEqual([]);
  });

  it("throttles by account and, behind a configured trusted proxy header, by client address, with a message that is the same for unknown emails", async () => {
    vi.stubEnv("ADMIN_CLIENT_IP_HEADER", "x-forwarded-for");
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT; i++) await loginAction({}, form({ email: "ghost@example.com", password: "wrong password here" }));
    expect(await loginAction({}, form({ email: "ghost@example.com", password: "wrong password here" }))).toEqual({ error: THROTTLED_MESSAGE });
    for (let i = ACCOUNT_ATTEMPT_LIMIT + 1; i < CLIENT_ATTEMPT_LIMIT; i++) await loginAction({}, form({ email: `user${i}@example.com`, password: "wrong password here" }));
    expect(await loginAction({}, form({ email: "admin@example.com", password: PASSWORD }))).toEqual({ error: THROTTLED_MESSAGE });
    h.requestHeaders = new Headers({ "x-forwarded-for": "192.0.2.50" });
    expect(await redirectOf(loginAction({}, form({ email: "admin@example.com", password: PASSWORD })))).toBe("/admin");
    vi.unstubAllEnvs();
  });

  it("reports infrastructure failures generically and logs no credentials", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    h.fake.store.adminUser.findUnique = async () => { throw new Error("db unreachable for admin@example.com"); };
    expect(await loginAction({}, form({ email: "admin@example.com", password: PASSWORD }))).toEqual({ error: UNAVAILABLE_MESSAGE });
    const output = JSON.stringify(logged.mock.calls);
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain("admin@example.com");
    logged.mockRestore();
  });
});

describe("logout action", () => {
  it("revokes the server session, clears the cookie, and redirects to login", async () => {
    const token = await signIn();
    expect(await redirectOf(logoutAction())).toBe("/admin/login");
    expect(h.fake.sessions()).toEqual([]);
    expect(h.jar.get(COOKIE)).toEqual({ value: "", options: expect.objectContaining({ maxAge: 0, path: "/", httpOnly: true }) });
    h.jar.set(COOKIE, { value: token });
    expect(await getCurrentAdmin()).toBeNull();
  });

  it("still clears the cookie when the server session is already gone", async () => {
    await signIn();
    await h.fake.store.adminSession.deleteMany({ where: {} });
    expect(await redirectOf(logoutAction())).toBe("/admin/login");
    expect(cookieValue()).toBe("");
  });
});

describe("password change action", () => {
  const fields = (overrides: Record<string, string> = {}) => form({ currentPassword: PASSWORD, newPassword: "une toute nouvelle phrase secrète", confirmation: "une toute nouvelle phrase secrète", ...overrides });

  it("requires authentication", async () => {
    expect(await redirectOf(changePasswordAction({}, fields()))).toBe("/admin/login");
  });

  it("reports validation failures without signing the admin out", async () => {
    await signIn();
    expect(await changePasswordAction({}, fields({ currentPassword: "not my password" }))).toEqual({ error: "Le mot de passe actuel est incorrect." });
    expect(await changePasswordAction({}, fields({ confirmation: "different" }))).toEqual({ error: "La confirmation ne correspond pas au nouveau mot de passe." });
    expect(await changePasswordAction({}, fields({ newPassword: "short", confirmation: "short" }))).toMatchObject({ error: expect.stringContaining("12") });
    expect(await getCurrentAdmin()).not.toBeNull();
  });

  it("revokes every session, clears the cookie, and forces a fresh login", async () => {
    const first = await signIn();
    await signIn();
    expect(await redirectOf(changePasswordAction({}, fields()))).toBe(PASSWORD_CHANGED_PATH);
    expect(h.fake.sessions()).toEqual([]);
    expect(cookieValue()).toBe("");
    h.jar.set(COOKIE, { value: first });
    expect(await getCurrentAdmin()).toBeNull();
    expect(await loginAction({}, form({ email: "admin@example.com", password: PASSWORD }))).toEqual({ error: INVALID_LOGIN_MESSAGE });
  });

  it("never reports success when revocation fails mid-transaction", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const token = await signIn();
    const original = h.fake.store.adminSession.deleteMany;
    h.fake.store.adminSession.deleteMany = async (args: any) => { if (args.where.adminUserId && !args.where.expiresAt) throw new Error("connection lost"); return original(args); };
    expect(await changePasswordAction({}, fields())).toEqual({ error: UNAVAILABLE_MESSAGE });
    expect(cookieValue()).toBe(token);
    expect(await getCurrentAdmin()).not.toBeNull();
    expect(await redirectOf(loginAction({}, form({ email: "admin@example.com", password: PASSWORD })))).toBe("/admin");
    vi.mocked(console.error).mockRestore();
  });
});

describe("route surface", () => {
  const appDir = join(__dirname, "..", "app");
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; });
  const routes = files(appDir).map(path => relative(appDir, path));

  it("exposes no registration, sign-up, password-reset, or email-verification routes", () => {
    expect(routes.filter(path => /register|signup|sign-up|inscription|forgot|reset|verify/i.test(path))).toEqual([]);
  });

  it("exposes no GET route handlers in the admin area (logout is a POST Server Action)", () => {
    const handlers = routes.filter(path => path.startsWith("admin") && /(^|\/)route\.(t|j)sx?$/.test(path));
    expect(handlers.filter(path => /export\s+(async\s+)?(function|const)\s+GET\b/.test(readFileSync(join(appDir, path), "utf8")))).toEqual([]);
    expect(typeof logoutAction).toBe("function");
  });
});
