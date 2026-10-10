// Compatibility entrypoint for the integration setup and its existing imports.
export {
  assertConnectedToTestDatabase,
  assertSafeTestDatabaseUrl,
  TEST_DATABASE_NAME,
  UnsafeTestDatabaseError,
} from "../../../lib/database/disposable-database-guard";
