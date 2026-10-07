import "server-only";
import { Prisma } from "@prisma/client";

/**
 * Security-sensitive persistence primitive: serializes session creation against password change.
 *
 * Both login and password change run their transactions at READ COMMITTED (pinned explicitly; see
 * CREDENTIAL_TRANSACTION_OPTIONS). Login takes this lock before inserting its session; password change
 * issues `UPDATE "AdminUser" … WHERE "passwordHash" = <old>`, which takes a conflicting row lock.
 *
 * Login locks first: the password change's UPDATE waits until login commits. Its following
 *   `DELETE FROM "AdminSession" WHERE "adminUserId" = …` statement takes a fresh READ COMMITTED snapshot,
 *   so it sees and revokes the session login just committed.
 * Password change locks first: this SELECT … FOR UPDATE waits until the change commits, then PostgreSQL
 *   re-evaluates the WHERE clause against the updated row version (READ COMMITTED re-check). The hash no
 *   longer matches, no row is returned, and login fails without creating a session.
 *
 * The lock is acquired without writing to AdminUser, so a successful login leaves `updatedAt` untouched.
 * Values are bound parameters (tagged template), never interpolated into the SQL text.
 */
export async function lockVerifiedAdminCredential(tx: Prisma.TransactionClient, adminUserId: string, verifiedPasswordHash: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "AdminUser"
    WHERE "id" = ${adminUserId}::uuid
      AND "passwordHash" = ${verifiedPasswordHash}
      AND "status" = 'ACTIVE'::"AdminStatus"
    FOR UPDATE`;
  return rows.length === 1;
}

/**
 * The ordering above relies on READ COMMITTED's per-statement snapshots and WHERE re-check. It is pinned so a
 * different database default (e.g. REPEATABLE READ, where the revoking DELETE could miss a concurrently
 * committed session) cannot silently weaken the guarantee.
 */
export const CREDENTIAL_TRANSACTION_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;
