import { describe, expect, it, vi } from "vitest";

import {
  DISPOSABLE_DATABASE_MODE,
  initializePrismaRuntime,
  resolvePrismaRuntime,
} from "../lib/database/disposable-runtime";
import { UnsafeTestDatabaseError } from "./integration/support/test-database-guard";

const SAFE_TEST_URL = "postgresql://tester@localhost:5432/bakanel_test";
const NEON_URL =
  "postgresql://owner:secret@ep-example-123.us-east-2.aws.neon.tech/neondb?sslmode=require";

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL: NEON_URL,
    DIRECT_URL: NEON_URL,
    TEST_DATABASE_URL: SAFE_TEST_URL,
    NODE_ENV: "development",
    ...overrides,
  };
}

describe("disposable Prisma runtime", () => {
  it("keeps the default runtime on the Neon adapter", () => {
    expect(resolvePrismaRuntime(environment())).toEqual({
      adapter: "neon",
      connectionString: NEON_URL,
    });
  });

  it("uses PostgreSQL only after explicit disposable opt-in", () => {
    expect(resolvePrismaRuntime(environment({ [DISPOSABLE_DATABASE_MODE]: "1" }))).toEqual({
      adapter: "postgres",
      connectionString: SAFE_TEST_URL,
    });
  });

  it("does not activate disposable mode from NODE_ENV=test alone", () => {
    expect(resolvePrismaRuntime(environment({ NODE_ENV: "test" }))).toMatchObject({
      adapter: "neon",
    });
  });

  it("rejects disposable mode in production", () => {
    expect(() =>
      resolvePrismaRuntime(
        environment({ [DISPOSABLE_DATABASE_MODE]: "1", NODE_ENV: "production" }),
      ),
    ).toThrow(`${DISPOSABLE_DATABASE_MODE} cannot be used in production.`);
  });

  it.each([
    ["a missing URL", undefined],
    ["a remote host", "postgresql://tester@db.internal.example.com:5432/bakanel_test"],
    ["a Neon URL", "postgresql://tester@ep-example.neon.tech/bakanel_test"],
    ["a wrong database", "postgresql://tester@localhost:5432/bakanel"],
    ["a malformed URL", "not a database URL"],
  ])("rejects %s before adapter initialization", (_description, testDatabaseUrl) => {
    const factories = {
      createNeon: vi.fn(),
      createPostgres: vi.fn(),
    };

    expect(() =>
      initializePrismaRuntime(
        environment({
          [DISPOSABLE_DATABASE_MODE]: "1",
          TEST_DATABASE_URL: testDatabaseUrl,
        }),
        factories,
      ),
    ).toThrow(UnsafeTestDatabaseError);
    expect(factories.createNeon).not.toHaveBeenCalled();
    expect(factories.createPostgres).not.toHaveBeenCalled();
  });

  it("rejects missing opt-in values and overlapping application settings before initialization", () => {
    const factories = {
      createNeon: vi.fn(),
      createPostgres: vi.fn(),
    };

    expect(() =>
      initializePrismaRuntime(environment({ [DISPOSABLE_DATABASE_MODE]: "true" }), factories),
    ).toThrow(`${DISPOSABLE_DATABASE_MODE} must be set to "1" when provided.`);
    expect(() =>
      initializePrismaRuntime(
        environment({
          [DISPOSABLE_DATABASE_MODE]: "1",
          DATABASE_URL: SAFE_TEST_URL,
        }),
        factories,
      ),
    ).toThrow(UnsafeTestDatabaseError);
    expect(() =>
      initializePrismaRuntime(
        environment({
          [DISPOSABLE_DATABASE_MODE]: "1",
          DIRECT_URL: "postgresql://app@127.0.0.1:5432/bakanel_test",
        }),
        factories,
      ),
    ).toThrow(UnsafeTestDatabaseError);
    expect(factories.createNeon).not.toHaveBeenCalled();
    expect(factories.createPostgres).not.toHaveBeenCalled();
  });

  it("constructs only the selected adapter after validation", () => {
    const factories = {
      createNeon: vi.fn().mockReturnValue("neon client"),
      createPostgres: vi.fn().mockReturnValue("postgres client"),
    };

    expect(
      initializePrismaRuntime(environment({ [DISPOSABLE_DATABASE_MODE]: "1" }), factories),
    ).toBe("postgres client");
    expect(factories.createPostgres).toHaveBeenCalledWith(SAFE_TEST_URL);
    expect(factories.createNeon).not.toHaveBeenCalled();
  });
});
