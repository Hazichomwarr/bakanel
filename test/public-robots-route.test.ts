import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/robots.txt/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public robots route", () => {
  it("reads the production site configuration at request time", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://www.bakanel.example");

    const response = GET();

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    await expect(response.text()).resolves.toContain(
      "Sitemap: https://www.bakanel.example/sitemap-index.xml",
    );
  });

  it("does not advertise a sitemap when the production origin is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "");

    await expect(GET().text()).resolves.toBe("User-Agent: *\nDisallow: /\n");
  });
});
