import { AdminAuthError } from "./errors";

export const PASSWORD_MIN_LENGTH = 12;
/** Upper bound (in Unicode code points, so at most 1 KiB of UTF-8) that keeps Argon2 input bounded; never truncated. */
export const PASSWORD_MAX_LENGTH = 256;
const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 200;

export const passwordLength = (password: string) => [...password].length;

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new AdminAuthError("INVALID_EMAIL", "A valid email address is required.");
  return email;
}

export function normalizeAdminName(value: string) {
  const name = value.trim();
  if (!name || name.length > NAME_MAX_LENGTH) throw new AdminAuthError("INVALID_ADMIN_NAME", "Admin name is required.");
  return name;
}

/** Length-only policy: no composition rules, so long passphrases of any characters are valid. */
export function assertPasswordPolicy(password: string) {
  const length = passwordLength(password);
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new AdminAuthError("INVALID_PASSWORD", `Password must contain between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`);
  }
}
