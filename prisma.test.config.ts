import "dotenv/config";
import { defineConfig } from "prisma/config";

import { assertSafeTestDatabaseUrl } from "./test/integration/support/test-database-guard";

// Integration-test migrations only. The guard throws before Prisma can connect unless
// TEST_DATABASE_URL is a loopback `bakanel_test` database distinct from the application URLs.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: assertSafeTestDatabaseUrl(process.env),
  },
});
