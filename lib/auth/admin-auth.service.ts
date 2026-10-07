import "server-only";
import { AdminStatus, PrismaClient, type AdminUser } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CREDENTIAL_TRANSACTION_OPTIONS, lockVerifiedAdminCredential } from "./admin-credential-lock";
import { SESSION_TTL_MS } from "./cookie";
import { AdminAuthError, type AdminAuthErrorCode } from "./errors";
import { passwordHasher, type PasswordHasher } from "./password";
import { generateSessionToken, hashSessionToken, hashThrottleKey, isWellFormedSessionToken } from "./session";
import { assertPasswordPolicy, normalizeAdminName, normalizeEmail, PASSWORD_MAX_LENGTH, passwordLength } from "./validation";

/** Fixed-window throttling persisted in PostgreSQL, so every application instance shares the counters. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Attempts per submitted email per window, whether or not the account exists. */
export const ACCOUNT_ATTEMPT_LIMIT = 10;
/** Attempts per client address per window, bounding password spraying across emails. */
export const CLIENT_ATTEMPT_LIMIT = 30;

export type AuthenticatedAdmin = { id: string; email: string; name: string };
export type IssuedSession = { token: string; expiresAt: Date };
export type LoginInput = { email: string; password: string; clientAddress?: string | null };
export type ChangePasswordInput = { currentPassword: string; newPassword: string; confirmation: string };

function fail(code: AdminAuthErrorCode, message: string): never { throw new AdminAuthError(code, message); }
const isPrismaCode = (error: unknown, code: string) => typeof error === "object" && error !== null && "code" in error && error.code === code;
const toAuthenticatedAdmin = ({ id, email, name }: AdminUser): AuthenticatedAdmin => ({ id, email, name });
const invalidCredentials = () => fail("INVALID_CREDENTIALS", "Invalid email or password.");

export function createAdminAuthService(client: PrismaClient, deps: { passwords?: PasswordHasher; now?: () => Date; generateToken?: () => string } = {}) {
  const passwords = deps.passwords ?? passwordHasher;
  const now = deps.now ?? (() => new Date());
  const generateToken = deps.generateToken ?? generateSessionToken;

  const windowStartOf = (at: Date) => new Date(Math.floor(at.getTime() / LOGIN_WINDOW_MS) * LOGIN_WINDOW_MS);

  /** Atomic increment (INSERT … ON CONFLICT DO UPDATE); one retry covers a concurrent first insert if Prisma cannot use a native upsert. */
  async function recordAttempt(keyHash: string, windowStart: Date) {
    const attempt = () => client.adminLoginAttempt.upsert({ where: { keyHash_windowStart: { keyHash, windowStart } }, create: { keyHash, windowStart, attempts: 1 }, update: { attempts: { increment: 1 } } });
    try {
      return (await attempt()).attempts;
    } catch (error) {
      if (!isPrismaCode(error, "P2002")) throw error;
      return (await attempt()).attempts;
    }
  }

  /** Counts the attempt before any password work, so concurrent requests cannot all slip under the limit. */
  async function throttle(keys: string[], limits: number[], at: Date) {
    const windowStart = windowStartOf(at);
    await client.adminLoginAttempt.deleteMany({ where: { windowStart: { lt: windowStart } } });
    const counts = await Promise.all(keys.map(key => recordAttempt(key, windowStart)));
    if (counts.some((count, index) => count > limits[index])) fail("LOGIN_THROTTLED", "Too many attempts. Try again later.");
  }

  async function validSession(token: string | null | undefined) {
    if (!isWellFormedSessionToken(token)) return null;
    const session = await client.adminSession.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: { adminUser: true } });
    if (!session || session.expiresAt <= now() || !session.adminUser || session.adminUser.status !== AdminStatus.ACTIVE) return null;
    return session;
  }

  return {
    async provisionAdmin(input: { email: string; name: string; password: string }): Promise<AuthenticatedAdmin> {
      const email = normalizeEmail(input.email);
      const name = normalizeAdminName(input.name);
      assertPasswordPolicy(input.password);
      if (await client.adminUser.findUnique({ where: { email } })) fail("ADMIN_EMAIL_TAKEN", "An administrator with this email already exists.");
      const passwordHash = await passwords.hash(input.password);
      try {
        return toAuthenticatedAdmin(await client.adminUser.create({ data: { email, name, passwordHash } }));
      } catch (error) {
        if (isPrismaCode(error, "P2002")) fail("ADMIN_EMAIL_TAKEN", "An administrator with this email already exists.");
        throw error;
      }
    },

    async login(input: LoginInput): Promise<IssuedSession> {
      let email: string;
      try { email = normalizeEmail(input.email); } catch { return invalidCredentials(); }
      if (!input.password || passwordLength(input.password) > PASSWORD_MAX_LENGTH) return invalidCredentials();

      const at = now();
      const accountKey = hashThrottleKey("account", email);
      const clientAddress = input.clientAddress?.trim();
      await throttle(clientAddress ? [accountKey, hashThrottleKey("client", clientAddress)] : [accountKey], [ACCOUNT_ATTEMPT_LIMIT, CLIENT_ATTEMPT_LIMIT], at);

      const found = await client.adminUser.findUnique({ where: { email } });
      const admin = found?.status === AdminStatus.ACTIVE ? found : null;
      // Unknown and inactive accounts still pay for one Argon2id verification, against the dummy hash.
      const verified = await passwords.verify(admin?.passwordHash ?? (await passwords.dummyHash()), input.password);
      if (!admin || !verified) return invalidCredentials();

      const token = generateToken();
      const expiresAt = new Date(at.getTime() + SESSION_TTL_MS);
      await client.$transaction(async tx => {
        // Serializes against password change without mutating AdminUser; see lockVerifiedAdminCredential.
        if (!(await lockVerifiedAdminCredential(tx, admin.id, admin.passwordHash))) invalidCredentials();
        await tx.adminSession.deleteMany({ where: { adminUserId: admin.id, expiresAt: { lte: at } } });
        await tx.adminSession.create({ data: { adminUserId: admin.id, tokenHash: hashSessionToken(token), expiresAt } });
      }, CREDENTIAL_TRANSACTION_OPTIONS);
      await client.adminLoginAttempt.deleteMany({ where: { keyHash: accountKey } });
      return { token, expiresAt };
    },

    /** The single authority for authentication: unknown, malformed, expired, or inactive-admin sessions resolve to null. */
    async resolveSession(token: string | null | undefined): Promise<AuthenticatedAdmin | null> {
      const session = await validSession(token);
      return session ? toAuthenticatedAdmin(session.adminUser) : null;
    },

    /** Revokes the server-side session; a session that no longer exists is not an error. */
    async logout(token: string | null | undefined) {
      if (!isWellFormedSessionToken(token)) return;
      await client.adminSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    },

    /** On success every session of the admin, including the caller's, is revoked atomically with the hash update. */
    async changePassword(token: string | null | undefined, input: ChangePasswordInput) {
      const session = await validSession(token);
      if (!session) fail("UNAUTHENTICATED", "Authentication is required.");
      const admin = session.adminUser;
      const accountKey = hashThrottleKey("account", admin.email);
      await throttle([accountKey], [ACCOUNT_ATTEMPT_LIMIT], now());

      const currentValid = passwordLength(input.currentPassword) <= PASSWORD_MAX_LENGTH && (await passwords.verify(admin.passwordHash, input.currentPassword));
      if (!currentValid) fail("INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
      if (input.newPassword !== input.confirmation) fail("PASSWORD_CONFIRMATION_MISMATCH", "Password confirmation does not match.");
      assertPasswordPolicy(input.newPassword);

      const passwordHash = await passwords.hash(input.newPassword);
      await client.$transaction(async tx => {
        const updated = await tx.adminUser.updateMany({ where: { id: admin.id, passwordHash: admin.passwordHash, status: AdminStatus.ACTIVE }, data: { passwordHash } });
        if (!updated.count) fail("STALE_ADMIN_STATE", "Administrator changed concurrently.");
        await tx.adminSession.deleteMany({ where: { adminUserId: admin.id } });
      }, CREDENTIAL_TRANSACTION_OPTIONS);
      await client.adminLoginAttempt.deleteMany({ where: { keyHash: accountKey } });
    },
  };
}

export type AdminAuthService = ReturnType<typeof createAdminAuthService>;
export const adminAuthService = createAdminAuthService(prisma);
