import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { CREDENTIAL_TRANSACTION_OPTIONS, lockVerifiedAdminCredential } from "../lib/auth/admin-credential-lock";
import { createRecordingAdapter } from "./support/recording-adapter";

// Inspects the SQL Prisma 7's query compiler actually emits for the PostgreSQL-dependent auth guarantees.
// Offline: the recording adapter answers with empty result sets and contacts no database.

const ADMIN_ID = "6f1c2a7e-0d4b-4c39-9a51-2b8f3e7d1c90";
const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA";
const recordingClient = () => {
  const recording = createRecordingAdapter();
  return { ...recording, client: new PrismaClient({ adapter: recording.factory as never }) };
};

describe("login credential lock SQL", () => {
  it("is a parameterized SELECT … FOR UPDATE inside a READ COMMITTED transaction, with no write to AdminUser", async () => {
    const { client, statements } = recordingClient();
    const locked = await client.$transaction(tx => lockVerifiedAdminCredential(tx, ADMIN_ID, HASH), CREDENTIAL_TRANSACTION_OPTIONS);
    expect(locked).toBe(false); // empty result set: no matching row → no lock → login must fail

    expect(statements[0].sql).toBe("BEGIN ISOLATION LEVEL READ COMMITTED");
    const lock = statements.find(statement => statement.sql.includes("FOR UPDATE"))!;
    expect(lock.inTransaction).toBe(true);
    expect(lock.sql.replace(/\s+/g, " ").trim()).toBe(`SELECT "id" FROM "AdminUser" WHERE "id" = $1::uuid AND "passwordHash" = $2 AND "status" = 'ACTIVE'::"AdminStatus" FOR UPDATE`);
    expect(lock.args).toEqual([ADMIN_ID, HASH]);
    expect(lock.sql).not.toContain(ADMIN_ID);
    expect(lock.sql).not.toContain(HASH);
    expect(statements.some(statement => /^\s*(UPDATE|INSERT|DELETE)\b[^]*"AdminUser"/i.test(statement.sql))).toBe(false);
  });

  it("binds hostile values as parameters instead of splicing them into SQL", async () => {
    const { client, statements } = recordingClient();
    const hostile = `x' OR '1'='1"; DROP TABLE "AdminSession"; --`;
    await client.$transaction(tx => lockVerifiedAdminCredential(tx, ADMIN_ID, hostile), CREDENTIAL_TRANSACTION_OPTIONS);
    const lock = statements.find(statement => statement.sql.includes("FOR UPDATE"))!;
    expect(lock.sql).not.toContain("DROP TABLE");
    expect(lock.args).toContain(hostile);
  });
});

describe("password change SQL", () => {
  it("updates the hash conditionally, then revokes every session, in one READ COMMITTED transaction", async () => {
    const { client, statements } = recordingClient();
    // Same Prisma operations as AdminAuthService.changePassword's transaction.
    await client.$transaction(async tx => {
      await tx.adminUser.updateMany({ where: { id: ADMIN_ID, passwordHash: HASH, status: "ACTIVE" }, data: { passwordHash: "new-hash" } });
      await tx.adminSession.deleteMany({ where: { adminUserId: ADMIN_ID } });
    }, CREDENTIAL_TRANSACTION_OPTIONS);

    const sql = statements.map(statement => statement.sql);
    const update = sql.findIndex(text => text.startsWith(`UPDATE "public"."AdminUser"`));
    const revoke = sql.findIndex(text => text.startsWith(`DELETE FROM "public"."AdminSession"`));
    expect(sql[0]).toBe("BEGIN ISOLATION LEVEL READ COMMITTED");
    expect(sql[update]).toMatch(/WHERE \(.*"id" = \$\d+ AND .*"passwordHash" = \$\d+ AND .*"status" = CAST\(\$\d+::text AS "public"\."AdminStatus"\)\)/);
    expect(update).toBeGreaterThan(0);
    expect(revoke).toBeGreaterThan(update);
    expect(statements[revoke].inTransaction).toBe(true);
    expect(sql[revoke]).toMatch(/WHERE "public"\."AdminSession"\."adminUserId" = \$1$/);
    expect(sql.slice(revoke + 1)).toContain("COMMIT");
  });
});

describe("login attempt counter SQL", () => {
  it("is one native INSERT … ON CONFLICT DO UPDATE increment, atomic without an application read", async () => {
    const { client, statements } = recordingClient();
    const windowStart = new Date("2026-10-06T10:00:00.000Z");
    await client.adminLoginAttempt
      .upsert({ where: { keyHash_windowStart: { keyHash: "k", windowStart } }, create: { keyHash: "k", windowStart, attempts: 1 }, update: { attempts: { increment: 1 } } })
      .catch(() => undefined); // empty RETURNING from the recorder; only the emitted SQL matters here
    const attempt = statements.filter(statement => statement.sql.includes(`"AdminLoginAttempt"`));
    expect(attempt).toHaveLength(1);
    expect(attempt[0].sql).toMatch(/^INSERT INTO "public"\."AdminLoginAttempt" .* ON CONFLICT \("keyHash","windowStart"\) DO UPDATE SET "attempts" = \("public"\."AdminLoginAttempt"\."attempts" \+ \$\d+\) .*RETURNING/);
    expect(attempt[0].inTransaction).toBe(false);
  });
});
