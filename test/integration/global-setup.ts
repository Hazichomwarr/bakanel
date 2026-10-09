import { execFileSync } from "node:child_process";

import "dotenv/config";
import { Client } from "pg";

import {
  assertConnectedToTestDatabase,
  assertSafeTestDatabaseUrl,
} from "./support/test-database-guard";

/**
 * Runs once before the integration suite: verify the target, then apply the committed
 * migrations non-destructively. Nothing touches a database until both checks pass.
 */
export default async function setup() {
  const connectionString = assertSafeTestDatabaseUrl(process.env);

  const connection = new Client({ connectionString });

  try {
    await connection.connect();
  } catch {
    throw new Error(
      "The integration test database is unavailable. Start local PostgreSQL and create bakanel_test (see docs/public-eligibility-contract.md).",
    );
  }

  try {
    await assertConnectedToTestDatabase(connection);
  } finally {
    await connection.end();
  }

  execFileSync(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy", "--config", "prisma.test.config.ts"],
    {
      stdio: "inherit",
    },
  );
}
