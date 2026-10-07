export const adminAuthErrorCodes = [
  "INVALID_EMAIL",
  "INVALID_ADMIN_NAME",
  "INVALID_PASSWORD",
  "PASSWORD_CONFIRMATION_MISMATCH",
  "ADMIN_EMAIL_TAKEN",
  "INVALID_CREDENTIALS",
  "INVALID_CURRENT_PASSWORD",
  "LOGIN_THROTTLED",
  "UNAUTHENTICATED",
  "STALE_ADMIN_STATE",
] as const;
export type AdminAuthErrorCode = (typeof adminAuthErrorCodes)[number];

export class AdminAuthError extends Error {
  constructor(readonly code: AdminAuthErrorCode, message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}
