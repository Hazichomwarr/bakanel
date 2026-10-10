import "dotenv/config";
import { spawn } from "node:child_process";

import { disposableNextDevArguments } from "../lib/database/disposable-dev-arguments";
import { DISPOSABLE_DATABASE_MODE, resolvePrismaRuntime } from "../lib/database/disposable-runtime";

process.env[DISPOSABLE_DATABASE_MODE] = "1";
resolvePrismaRuntime(process.env);

// Loopback only: a non-loopback hostname throws before the server starts.
const nextArguments = disposableNextDevArguments(process.argv.slice(2));

const next = spawn("pnpm", ["exec", "next", "dev", ...nextArguments], {
  env: process.env,
  stdio: "inherit",
});

next.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
