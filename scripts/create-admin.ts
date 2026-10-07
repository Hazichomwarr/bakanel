/**
 * Deliberate, server-side AdminUser provisioning. There is no public registration.
 *
 *   pnpm admin:create --email admin@example.com --name "Prénom Nom"
 *
 * The password is never accepted as an argument (it would leak into shell history and process listings).
 * It is read from a no-echo prompt on a TTY, or from the first line of stdin when piped.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { AdminAuthError } from "../lib/auth/errors";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../lib/auth/validation";

function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") { cleanup(); stdout.write("\n"); reject(new Error("Cancelled.")); return; }
        if (char === "\r" || char === "\n" || char === "\u0004") { cleanup(); stdout.write("\n"); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = [...value].slice(0, -1).join("");
        else value += char;
      }
    };
    const cleanup = () => { stdin.off("data", onData); stdin.setRawMode(false); stdin.pause(); };
    stdin.on("data", onData);
  });
}

async function readFirstStdinLine() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.includes("\n")) break;
  }
  return input.split(/\r?\n/)[0] ?? "";
}

async function readPassword() {
  if (!process.stdin.isTTY) return readFirstStdinLine();
  console.log(`Password: ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters; passphrases are welcome.`);
  const password = await readHidden("Password: ");
  const confirmation = await readHidden("Confirm password: ");
  if (password !== confirmation) throw new AdminAuthError("PASSWORD_CONFIRMATION_MISMATCH", "Passwords do not match.");
  return password;
}

async function main() {
  if (process.argv.slice(2).some(arg => /^--?(p|pass|password|pwd)(=|$)/i.test(arg))) {
    // The value itself is never echoed.
    console.error("Refused: passwords are never accepted as command-line arguments. Enter it at the prompt or pipe it on stdin.");
    process.exitCode = 1;
    return;
  }
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } }, strict: true });
  if (!values.email || !values.name) {
    console.error('Usage: pnpm admin:create --email <email> --name "<full name>"');
    process.exitCode = 1;
    return;
  }
  const password = await readPassword();
  // Imported after argument handling so usage errors never open a database connection.
  const { adminAuthService } = await import("../lib/auth/admin-auth.service");
  const admin = await adminAuthService.provisionAdmin({ email: values.email, name: values.name, password });
  console.log(`Administrator created: ${admin.email}`);
}

main()
  .catch(error => {
    // Only the domain message or error class is printed: never the password, its hash, or the raw error payload.
    console.error(error instanceof AdminAuthError ? `Refused (${error.code}): ${error.message}` : `Failed: ${error instanceof Error ? error.name : "unknown error"}.`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const loaded = await import("../lib/prisma").catch(() => null);
    await loaded?.prisma.$disconnect();
  });
