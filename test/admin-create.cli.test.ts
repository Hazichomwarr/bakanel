import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Runs the real provisioning command. DATABASE_URL points at an unreachable local port (dotenv never overrides
// an existing variable), so even an accidental query could not reach the development database.
const root = join(__dirname, "..");
const tsx = join(root, "node_modules", ".bin", "tsx");

function run(args: string[], stdin = "") {
  const result = spawnSync(tsx, ["--conditions=react-server", "scripts/create-admin.ts", ...args], {
    cwd: root,
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "postgresql://cli-test:cli-test@127.0.0.1:1/unreachable" },
    timeout: 30_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("pnpm admin:create", () => {
  it.each([
    ["--password value", ["--email", "a@example.com", "--name", "A", "--password", "SuperSecretValue123"]],
    ["--password=value", ["--email", "a@example.com", "--name", "A", "--password=SuperSecretValue123"]],
    ["-p value", ["-p", "SuperSecretValue123", "--email", "a@example.com", "--name", "A"]],
    ["--pwd value", ["--pwd", "SuperSecretValue123"]],
  ])("refuses a password passed as an argument (%s) without echoing it", (_label, args) => {
    const { status, output } = run(args);
    expect(status).toBe(1);
    expect(output).toContain("never accepted as command-line arguments");
    expect(output).not.toContain("SuperSecretValue123");
  });

  it.each([
    ["a weak password", ["--email", "a@example.com", "--name", "A"], "short-pw\n", "INVALID_PASSWORD"],
    ["an oversized password", ["--email", "a@example.com", "--name", "A"], `${"Z".repeat(300)}\n`, "INVALID_PASSWORD"],
    ["an invalid email", ["--email", "not-an-email", "--name", "A"], "correct horse battery staple\n", "INVALID_EMAIL"],
    ["a blank name", ["--email", "a@example.com", "--name", "   "], "correct horse battery staple\n", "INVALID_ADMIN_NAME"],
  ])("rejects %s with a typed refusal that never contains the password", (_label, args, stdin, code) => {
    const { status, output } = run(args, stdin);
    expect(status).toBe(1);
    expect(output).toContain(`Refused (${code})`);
    expect(output).not.toContain(stdin.trim());
    expect(output).not.toMatch(/\$argon2/);
  });

  it("prints usage when identity arguments are missing", () => {
    const { status, output } = run([]);
    expect(status).toBe(1);
    expect(output).toContain("Usage: pnpm admin:create");
  });
});
