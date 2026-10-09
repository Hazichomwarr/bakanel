import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { assertSafeTestDatabaseUrl } from "./test-database-guard";

/**
 * Builds an isolated Prisma client for the guarded test database. It never touches the
 * application singleton in `lib/prisma.ts`; callers must `$disconnect()` it.
 */
export function createTestPrismaClient() {
  const connectionString = assertSafeTestDatabaseUrl(process.env);
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}
