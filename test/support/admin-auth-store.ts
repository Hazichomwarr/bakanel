/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminStatus } from "@prisma/client";

const uniqueViolation = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
const copy = <T>(row: T | undefined) => (row ? structuredClone(row) : null);

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([field, condition]: [string, any]) => {
    const value = row[field];
    if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
    if (condition && typeof condition === "object") {
      if ("lt" in condition) return value < condition.lt;
      if ("lte" in condition) return value <= condition.lte;
    }
    return value === condition;
  });
}

/**
 * In-memory Prisma boundary for AdminUser, AdminSession and AdminLoginAttempt. Reads return copies;
 * `$transaction` rolls back on throw; `beforeNextWrite` runs a competing writer before the next write;
 * `failNext` makes a named operation throw once, to prove atomicity.
 */
export function createAdminAuthStore() {
  let admins = new Map<string, any>();
  let sessions = new Map<string, any>();
  let attempts = new Map<string, any>();
  const operations: string[] = [];
  let pending: (() => void) | undefined;
  let failing: string | undefined;
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const attemptKey = (keyHash: string, windowStart: Date) => `${keyHash}@${windowStart.toISOString()}`;
  const record = (name: string, isWrite: boolean) => {
    operations.push(name);
    if (failing === name) { failing = undefined; throw new Error(`Injected failure: ${name}`); }
    if (isWrite) { const competingWriter = pending; pending = undefined; competingWriter?.(); }
  };

  const transactionOptions: unknown[] = [];
  const store: any = {
    // Models lockVerifiedAdminCredential's SELECT … FOR UPDATE: a row is returned (and "locked") only while the
    // admin is ACTIVE with exactly the verified hash. Competing writers registered with beforeNextWrite commit first.
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (!/FROM "AdminUser"[^]*FOR UPDATE/.test(sql)) throw new Error(`Unexpected raw SQL in fake: ${sql}`);
      record("adminUser.lockForUpdate", true);
      const [id, passwordHash] = values;
      const row = admins.get(id as string);
      return row && row.passwordHash === passwordHash && row.status === AdminStatus.ACTIVE ? [{ id: row.id }] : [];
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>, options?: unknown) => {
      transactionOptions.push(options);
      const snapshot = structuredClone({ admins, sessions, attempts });
      try {
        return await callback(store);
      } catch (error) {
        ({ admins, sessions, attempts } = snapshot);
        throw error;
      }
    },
    adminUser: {
      findUnique: async ({ where }: any) => {
        record("adminUser.findUnique", false);
        return copy(where.id ? admins.get(where.id) : [...admins.values()].find(admin => admin.email === where.email));
      },
      create: async ({ data }: any) => {
        record("adminUser.create", true);
        if ([...admins.values()].some(admin => admin.email === data.email)) throw uniqueViolation();
        const row = { id: nextId("admin"), status: AdminStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date(), ...data };
        admins.set(row.id, row);
        return copy(row);
      },
      updateMany: async ({ where, data }: any) => {
        record("adminUser.updateMany", true);
        const row = admins.get(where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    adminSession: {
      create: async ({ data }: any) => {
        record("adminSession.create", true);
        if ([...sessions.values()].some(session => session.tokenHash === data.tokenHash)) throw uniqueViolation();
        const row = { id: nextId("session"), createdAt: new Date(), ...data };
        sessions.set(row.id, row);
        return copy(row);
      },
      findUnique: async ({ where, include }: any) => {
        record("adminSession.findUnique", false);
        const session = [...sessions.values()].find(row => row.tokenHash === where.tokenHash);
        if (!session) return null;
        return include?.adminUser ? { ...copy(session), adminUser: copy(admins.get(session.adminUserId)) } : copy(session);
      },
      deleteMany: async ({ where }: any) => {
        record("adminSession.deleteMany", true);
        const doomed = [...sessions.values()].filter(row => matches(row, where));
        for (const row of doomed) sessions.delete(row.id);
        return { count: doomed.length };
      },
    },
    adminLoginAttempt: {
      upsert: async ({ where, create, update }: any) => {
        record("adminLoginAttempt.upsert", true);
        const { keyHash, windowStart } = where.keyHash_windowStart;
        const key = attemptKey(keyHash, windowStart);
        const existing = attempts.get(key);
        if (existing) existing.attempts += update.attempts.increment;
        else attempts.set(key, { ...create });
        return copy(attempts.get(key));
      },
      deleteMany: async ({ where }: any) => {
        record("adminLoginAttempt.deleteMany", true);
        let count = 0;
        for (const [key, row] of attempts) if (matches(row, where)) { attempts.delete(key); count++; }
        return { count };
      },
    },
  };

  return {
    store,
    operations,
    transactionOptions,
    admins: () => [...admins.values()],
    sessions: () => [...sessions.values()],
    attempts: () => [...attempts.values()],
    adminByEmail: (email: string) => [...admins.values()].find(admin => admin.email === email),
    deleteAdminRowOnly: (id: string) => admins.delete(id),
    beforeNextWrite: (competingWriter: () => void) => (pending = competingWriter),
    failNext: (operation: string) => (failing = operation),
  };
}
