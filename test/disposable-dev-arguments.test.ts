import { describe, expect, it } from "vitest";

import {
  disposableNextDevArguments,
  UnsafeDisposableHostnameError,
} from "../lib/database/disposable-dev-arguments";

describe("disposable runtime binding", () => {
  it("binds to loopback when no hostname is given", () => {
    expect(disposableNextDevArguments(["--", "-p", "3013"])).toEqual([
      "-p",
      "3013",
      "-H",
      "127.0.0.1",
    ]);
    expect(disposableNextDevArguments([])).toEqual(["-H", "127.0.0.1"]);
  });

  it.each([
    [["-H", "127.0.0.1"]],
    [["-H", "localhost"]],
    [["--hostname", "::1"]],
    [["--hostname=localhost"]],
    [["-H127.0.0.1"]],
  ])("keeps an explicit loopback hostname %j unchanged", (hostnameArguments) => {
    expect(disposableNextDevArguments(["-p", "3013", ...hostnameArguments])).toEqual([
      "-p",
      "3013",
      ...hostnameArguments,
    ]);
  });

  it.each([
    [["-H", "0.0.0.0"]],
    [["-H", "::"]],
    [["--hostname", "192.168.1.24"]],
    [["--hostname=example.org"]],
    [["-H0.0.0.0"]],
    [["-H"]],
  ])("refuses the non-loopback hostname %j", (hostnameArguments) => {
    expect(() => disposableNextDevArguments(["-p", "3013", ...hostnameArguments])).toThrow(
      UnsafeDisposableHostnameError,
    );
  });
});
