/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Offline Prisma driver adapter: records every SQL statement Prisma 7's query compiler emits (with bound
 * arguments and transaction boundaries) and answers with empty result sets. No database is contacted.
 */
export type RecordedStatement = { sql: string; args: unknown[]; inTransaction: boolean };

export function createRecordingAdapter() {
  const statements: RecordedStatement[] = [];
  const empty = { columnNames: [], columnTypes: [], rows: [] };
  const queryable = (inTransaction: boolean) => ({
    provider: "postgres" as const,
    adapterName: "recording",
    queryRaw: async (query: any) => { statements.push({ sql: query.sql, args: query.args, inTransaction }); return empty; },
    executeRaw: async (query: any) => { statements.push({ sql: query.sql, args: query.args, inTransaction }); return 0; },
  });
  const adapter = {
    ...queryable(false),
    executeScript: async () => {},
    dispose: async () => {},
    startTransaction: async (isolationLevel?: string) => {
      statements.push({ sql: `BEGIN${isolationLevel ? ` ISOLATION LEVEL ${isolationLevel}` : ""}`, args: [], inTransaction: true });
      return {
        ...queryable(true),
        options: { usePhantomQuery: false },
        commit: async () => void statements.push({ sql: "COMMIT", args: [], inTransaction: true }),
        rollback: async () => void statements.push({ sql: "ROLLBACK", args: [], inTransaction: true }),
      };
    },
  };
  return { factory: { provider: "postgres" as const, adapterName: "recording", connect: async () => adapter }, statements };
}
