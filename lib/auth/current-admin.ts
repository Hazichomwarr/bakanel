import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAuthService, type AuthenticatedAdmin, type IssuedSession } from "./admin-auth.service";
import { trustedClientAddress } from "./client-address";
import { clearedSessionCookieOptions, sessionCookieName, sessionCookieOptions } from "./cookie";

export const ADMIN_LOGIN_PATH = "/admin/login";
export const ADMIN_HOME_PATH = "/admin";

export async function readSessionToken() {
  return (await cookies()).get(sessionCookieName())?.value ?? null;
}

/** Resolves the admin from the server-side session store on every request; deduplicated per request only. */
export const getCurrentAdmin = cache(async (): Promise<AuthenticatedAdmin | null> => adminAuthService.resolveSession(await readSessionToken()));

/** Authoritative guard for admin pages and Server Actions; proxy.ts is only an early redirect. */
export async function requireAdmin(): Promise<AuthenticatedAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect(ADMIN_LOGIN_PATH);
  return admin;
}

export async function setSessionCookie(session: IssuedSession) {
  (await cookies()).set(sessionCookieName(), session.token, sessionCookieOptions(session.expiresAt));
}

export async function clearSessionCookie() {
  (await cookies()).set(sessionCookieName(), "", clearedSessionCookieOptions());
}

/** Secondary throttle key only; null unless a trusted proxy header is configured. See trustedClientAddress. */
export async function readClientAddress() {
  return trustedClientAddress(await headers());
}
