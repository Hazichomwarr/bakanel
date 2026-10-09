import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/lib\/prisma$/,
        replacement: fromRoot("./test/integration/support/forbidden-application-prisma.ts"),
      },
      { find: "server-only", replacement: fromRoot("./test/server-only.ts") },
      { find: "@", replacement: fromRoot("./") },
    ],
  },
  test: {
    include: ["test/integration/**/*.int.test.ts"],
    globalSetup: ["test/integration/global-setup.ts"],
    setupFiles: ["dotenv/config"],
    fileParallelism: false,
  },
});
