import { assertSafeTestDatabaseUrl } from "./disposable-database-guard";

export const DISPOSABLE_DATABASE_MODE = "BAKANEL_DISPOSABLE_DATABASE";

type Environment = Readonly<Record<string, string | undefined>>;

export type PrismaRuntime =
  | { adapter: "neon"; connectionString: string }
  | { adapter: "postgres"; connectionString: string };

/**
 * Chooses the server-side database adapter. Disposable PostgreSQL use is deliberately opt-in:
 * a local-looking URL or NODE_ENV=test can never activate it by itself.
 */
export function resolvePrismaRuntime(environment: Environment): PrismaRuntime {
  const disposableMode = environment[DISPOSABLE_DATABASE_MODE];

  if (disposableMode === undefined || disposableMode === "") {
    const connectionString = environment.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL must be configured to initialize Prisma.");
    }

    return { adapter: "neon", connectionString };
  }

  if (disposableMode !== "1") {
    throw new Error(`${DISPOSABLE_DATABASE_MODE} must be set to "1" when provided.`);
  }

  if (environment.NODE_ENV === "production") {
    throw new Error(`${DISPOSABLE_DATABASE_MODE} cannot be used in production.`);
  }

  return {
    adapter: "postgres",
    connectionString: assertSafeTestDatabaseUrl(environment),
  };
}

/**
 * Keeps adapter construction behind the validated runtime selection so rejected configurations
 * cannot initialize a database adapter.
 */
export function initializePrismaRuntime<T>(
  environment: Environment,
  factories: {
    createNeon: (connectionString: string) => T;
    createPostgres: (connectionString: string) => T;
  },
) {
  const runtime = resolvePrismaRuntime(environment);

  return runtime.adapter === "postgres"
    ? factories.createPostgres(runtime.connectionString)
    : factories.createNeon(runtime.connectionString);
}
