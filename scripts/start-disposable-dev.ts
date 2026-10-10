import "dotenv/config";
import { spawn } from "node:child_process";

import { DISPOSABLE_DATABASE_MODE, resolvePrismaRuntime } from "../lib/database/disposable-runtime";

process.env[DISPOSABLE_DATABASE_MODE] = "1";
resolvePrismaRuntime(process.env);

const nextArguments = process.argv.slice(2);
if (nextArguments[0] === "--") {
  nextArguments.shift();
}

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
