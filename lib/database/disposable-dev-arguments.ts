/**
 * `next dev` arguments for the disposable browser runtime. The server always binds to a
 * loopback address: without `-H`, `next dev` listens on every interface, which would expose a
 * synthetic administrator and the disposable database to the local network.
 */

export const DISPOSABLE_DEFAULT_HOSTNAME = "127.0.0.1";

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const HOSTNAME_FLAGS = new Set(["-H", "--hostname"]);

export class UnsafeDisposableHostnameError extends Error {
  constructor(hostname: string) {
    super(
      `Refusing to bind the disposable runtime to "${hostname}": only 127.0.0.1, localhost, or ::1 are allowed.`,
    );
    this.name = "UnsafeDisposableHostnameError";
  }
}

function assertLoopback(hostname: string | undefined) {
  if (hostname === undefined || !LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new UnsafeDisposableHostnameError(hostname ?? "");
  }
}

/** Removes a leading `--` separator, validates any hostname, and adds loopback when absent. */
export function disposableNextDevArguments(rawArguments: readonly string[]): string[] {
  const nextArguments = rawArguments[0] === "--" ? rawArguments.slice(1) : [...rawArguments];
  let hostnameProvided = false;

  nextArguments.forEach((argument, index) => {
    if (HOSTNAME_FLAGS.has(argument)) {
      hostnameProvided = true;
      assertLoopback(nextArguments[index + 1]);
    } else if (argument.startsWith("--hostname=")) {
      hostnameProvided = true;
      assertLoopback(argument.slice("--hostname=".length));
    } else if (/^-H./.test(argument)) {
      hostnameProvided = true;
      assertLoopback(argument.slice(2).replace(/^=/, ""));
    }
  });

  return hostnameProvided ? nextArguments : [...nextArguments, "-H", DISPOSABLE_DEFAULT_HOSTNAME];
}
