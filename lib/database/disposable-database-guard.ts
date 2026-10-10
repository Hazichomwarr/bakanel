/**
 * Fail-closed validation for the dedicated disposable PostgreSQL database. It is shared by
 * integration tests and the explicitly opted-in local browser-acceptance runtime.
 */

export const TEST_DATABASE_NAME = "bakanel_test";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const DEFAULT_POSTGRES_PORT = "5432";
const ALLOWED_QUERY_PARAMETERS = new Set([
  "sslmode",
  "connect_timeout",
  "application_name",
  "schema",
]);
const APPLICATION_DATABASE_VARIABLES = ["DATABASE_URL", "DIRECT_URL"];

export class UnsafeTestDatabaseError extends Error {
  constructor(reason: string) {
    super(`Refusing to use the disposable database: ${reason}`);
    this.name = "UnsafeTestDatabaseError";
  }
}

type DatabaseEndpoint = {
  host: string;
  port: string;
  database: string;
};

function parsePostgresUrl(value: string, label: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new UnsafeTestDatabaseError(`${label} is not a valid URL.`);
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeTestDatabaseError(`${label} must use the postgres:// or postgresql:// scheme.`);
  }

  return url;
}

function normalizedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return LOOPBACK_HOSTS.has(host) ? "loopback" : host;
}

function databaseName(url: URL) {
  try {
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return url.pathname.replace(/^\//, "");
  }
}

function endpointOf(url: URL): DatabaseEndpoint {
  return {
    host: normalizedHost(url.hostname),
    port: url.port || DEFAULT_POSTGRES_PORT,
    database: databaseName(url),
  };
}

function sameEndpoint(left: DatabaseEndpoint, right: DatabaseEndpoint) {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

/** Returns the verified URL before any disposable-database connection can be created. */
export function assertSafeTestDatabaseUrl(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const rawUrl = environment.TEST_DATABASE_URL?.trim();

  if (!rawUrl) {
    throw new UnsafeTestDatabaseError("TEST_DATABASE_URL is not defined.");
  }

  if (/neon/i.test(rawUrl)) {
    throw new UnsafeTestDatabaseError("TEST_DATABASE_URL must not reference a Neon host.");
  }

  const url = parsePostgresUrl(rawUrl, "TEST_DATABASE_URL");

  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new UnsafeTestDatabaseError(
      "TEST_DATABASE_URL host must be localhost, 127.0.0.1, or ::1.",
    );
  }

  for (const parameter of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMETERS.has(parameter.toLowerCase())) {
      throw new UnsafeTestDatabaseError(
        `TEST_DATABASE_URL query parameter "${parameter}" is not allowed.`,
      );
    }
  }

  const testEndpoint = endpointOf(url);

  if (testEndpoint.database !== TEST_DATABASE_NAME) {
    throw new UnsafeTestDatabaseError(
      `TEST_DATABASE_URL database must be "${TEST_DATABASE_NAME}".`,
    );
  }

  for (const variable of APPLICATION_DATABASE_VARIABLES) {
    const applicationUrl = environment[variable]?.trim();

    if (!applicationUrl) {
      continue;
    }

    if (applicationUrl === rawUrl) {
      throw new UnsafeTestDatabaseError(`TEST_DATABASE_URL must differ from ${variable}.`);
    }

    let applicationEndpoint: DatabaseEndpoint;

    try {
      applicationEndpoint = endpointOf(new URL(applicationUrl));
    } catch {
      continue;
    }

    if (sameEndpoint(testEndpoint, applicationEndpoint)) {
      throw new UnsafeTestDatabaseError(
        `TEST_DATABASE_URL points at the same database as ${variable}.`,
      );
    }
  }

  return rawUrl;
}

type QueryableConnection = {
  query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>;
};

/** Confirms over an open connection that the guarded server actually serves bakanel_test. */
export async function assertConnectedToTestDatabase(connection: QueryableConnection) {
  const result = await connection.query("select current_database() as database_name");
  const connectedDatabase = result.rows[0]?.database_name;

  if (connectedDatabase !== TEST_DATABASE_NAME) {
    throw new UnsafeTestDatabaseError(`connected database is not "${TEST_DATABASE_NAME}".`);
  }
}
