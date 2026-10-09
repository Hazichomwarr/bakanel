import { describe, expect, it, vi } from "vitest";

import {
  assertConnectedToTestDatabase,
  assertSafeTestDatabaseUrl,
  UnsafeTestDatabaseError,
} from "./integration/support/test-database-guard";

const SAFE_TEST_URL = "postgresql://tester@localhost:5432/bakanel_test";
const NEON_URL =
  "postgresql://owner:secret@ep-example-123.us-east-2.aws.neon.tech/neondb?sslmode=require";

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    TEST_DATABASE_URL: SAFE_TEST_URL,
    DATABASE_URL: NEON_URL,
    DIRECT_URL: NEON_URL,
    ...overrides,
  };
}

describe("integration test database guard", () => {
  it.each([
    "postgresql://tester@localhost:5432/bakanel_test",
    "postgres://tester@127.0.0.1/bakanel_test",
    "postgresql://tester@[::1]:5433/bakanel_test?sslmode=disable",
  ])("accepts the loopback bakanel_test database %s", (url) => {
    expect(assertSafeTestDatabaseUrl(environment({ TEST_DATABASE_URL: url }))).toBe(url);
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["malformed", "not a url"],
    ["non-postgres scheme", "mysql://tester@localhost/bakanel_test"],
  ])("rejects a %s TEST_DATABASE_URL", (_case, url) => {
    expect(() => assertSafeTestDatabaseUrl(environment({ TEST_DATABASE_URL: url }))).toThrow(
      UnsafeTestDatabaseError,
    );
  });

  it("rejects a production-like Neon URL even if it names bakanel_test", () => {
    const neonTestUrl = "postgresql://owner:secret@ep-example-123.aws.neon.tech/bakanel_test";

    expect(() =>
      assertSafeTestDatabaseUrl(environment({ TEST_DATABASE_URL: neonTestUrl })),
    ).toThrow(/Neon/);
  });

  it("rejects a remote shared-development host", () => {
    const sharedUrl = "postgresql://dev@db.internal.example.com:5432/bakanel_test";

    expect(() => assertSafeTestDatabaseUrl(environment({ TEST_DATABASE_URL: sharedUrl }))).toThrow(
      /host must be/,
    );
  });

  it.each(["bakanel", "bakanel_test_copy", "postgres", ""])(
    "rejects a loopback database not named exactly bakanel_test (%s)",
    (database) => {
      const url = `postgresql://tester@localhost:5432/${database}`;

      expect(() => assertSafeTestDatabaseUrl(environment({ TEST_DATABASE_URL: url }))).toThrow(
        /database must be/,
      );
    },
  );

  it.each(["host=ep-example.neon.tech", "host=/tmp", "dbname=bakanel", "port=6543", "options=-c"])(
    "rejects connection parameters that can redirect the connection (%s)",
    (parameter) => {
      const url = `postgresql://tester@localhost:5432/bakanel_test?${parameter}`;

      expect(() => assertSafeTestDatabaseUrl(environment({ TEST_DATABASE_URL: url }))).toThrow(
        UnsafeTestDatabaseError,
      );
    },
  );

  it("rejects a test URL identical to an application URL", () => {
    expect(() => assertSafeTestDatabaseUrl(environment({ DATABASE_URL: SAFE_TEST_URL }))).toThrow(
      /must differ from DATABASE_URL/,
    );
  });

  it("rejects differently written URLs that resolve to the same application database", () => {
    const applicationUrl = "postgres://app:password@127.0.0.1/bakanel_test?sslmode=disable";

    expect(() => assertSafeTestDatabaseUrl(environment({ DIRECT_URL: applicationUrl }))).toThrow(
      /same database as DIRECT_URL/,
    );
  });

  it("does not include the connection string in its error message", () => {
    const secretUrl = "postgresql://owner:top-secret@ep-example.neon.tech/bakanel_test";

    expect(() => assertSafeTestDatabaseUrl(environment({ TEST_DATABASE_URL: secretUrl }))).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("top-secret") }),
    );
  });

  it("accepts an open connection only when it serves bakanel_test", async () => {
    const testConnection = {
      query: vi.fn().mockResolvedValue({ rows: [{ database_name: "bakanel_test" }] }),
    };
    const otherConnection = {
      query: vi.fn().mockResolvedValue({ rows: [{ database_name: "karmda_dev" }] }),
    };

    await expect(assertConnectedToTestDatabase(testConnection)).resolves.toBeUndefined();
    await expect(assertConnectedToTestDatabase(otherConnection)).rejects.toThrow(
      UnsafeTestDatabaseError,
    );
  });
});
