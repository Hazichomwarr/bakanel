"use server";

import { redirect } from "next/navigation";
import { adminAuthService } from "@/lib/auth/admin-auth.service";
import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH, clearSessionCookie, readClientAddress, readSessionToken, requireAdmin, setSessionCookie } from "@/lib/auth/current-admin";
import { AdminAuthError } from "@/lib/auth/errors";
import { INVALID_LOGIN_MESSAGE, PASSWORD_CHANGED_PATH, passwordChangeMessages, THROTTLED_MESSAGE, UNAVAILABLE_MESSAGE } from "./auth-messages";

// Server Actions are POST-only and Next.js rejects them when Origin does not match Host; together with the
// SameSite=Lax session cookie this is the CSRF boundary. Each action authenticates on its own.

export type AuthFormState = { error?: string };

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** Logs only the error class: auth errors can be thrown while credentials are in scope. */
function logUnexpected(operation: string, error: unknown) {
  console.error(`Admin ${operation} failed unexpectedly (${error instanceof Error ? error.name : "unknown error"}).`);
}

export async function loginAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  let session;
  try {
    session = await adminAuthService.login({ email: field(formData, "email"), password: field(formData, "password"), clientAddress: await readClientAddress() });
  } catch (error) {
    if (error instanceof AdminAuthError) return { error: error.code === "LOGIN_THROTTLED" ? THROTTLED_MESSAGE : INVALID_LOGIN_MESSAGE };
    logUnexpected("login", error);
    return { error: UNAVAILABLE_MESSAGE };
  }
  await setSessionCookie(session);
  // Fixed destination: no caller-supplied return URL, so no open redirect.
  redirect(ADMIN_HOME_PATH);
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  try {
    await adminAuthService.logout(token);
  } finally {
    await clearSessionCookie();
  }
  redirect(ADMIN_LOGIN_PATH);
}

export async function changePasswordAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  await requireAdmin();
  try {
    await adminAuthService.changePassword(await readSessionToken(), {
      currentPassword: field(formData, "currentPassword"),
      newPassword: field(formData, "newPassword"),
      confirmation: field(formData, "confirmation"),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      if (error.code === "UNAUTHENTICATED") redirect(ADMIN_LOGIN_PATH);
      return { error: passwordChangeMessages[error.code] ?? UNAVAILABLE_MESSAGE };
    }
    logUnexpected("password change", error);
    return { error: UNAVAILABLE_MESSAGE };
  }
  await clearSessionCookie();
  redirect(PASSWORD_CHANGED_PATH);
}
