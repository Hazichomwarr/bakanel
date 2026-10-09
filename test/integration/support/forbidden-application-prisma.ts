/**
 * Replaces `@/lib/prisma` in the integration suite. Reader modules may hold a reference to the
 * application singleton, but any use of it fails instead of reaching a configured database.
 */
export const prisma = new Proxy(
  {},
  {
    get() {
      throw new Error("The application Prisma singleton must not be used in integration tests.");
    },
  },
);
