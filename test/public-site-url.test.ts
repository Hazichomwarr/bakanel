import { afterEach, describe, expect, it, vi } from "vitest";

import { publicRobotsText } from "../lib/public/robots";
import { getPublicSiteUrl, publicAbsoluteUrl } from "../lib/public/site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public site URL configuration", () => {
  it("returns no origin until deployment supplies a site URL", () => {
    expect(getPublicSiteUrl({ NODE_ENV: "production" })).toBeNull();
  });

  it("accepts a verified HTTPS origin and creates absolute public URLs", () => {
    const siteUrl = getPublicSiteUrl({ SITE_URL: "https://www.bakanel.example" });

    expect(siteUrl?.origin).toBe("https://www.bakanel.example");
    expect(publicAbsoluteUrl("/fr/formations", siteUrl!)).toBe(
      "https://www.bakanel.example/fr/formations",
    );
  });

  it.each([
    "not a URL",
    "http://www.bakanel.example",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://www.bakanel.example:8443",
    "https://user:secret@www.bakanel.example",
    "https://www.bakanel.example/fr",
    "https://www.bakanel.example/?campaign=search",
  ])("rejects unsafe or malformed site URL %s", (siteUrl) => {
    expect(() => getPublicSiteUrl({ SITE_URL: siteUrl })).toThrow("Invalid SITE_URL configuration");
  });
});

describe("robots indexing policy", () => {
  it("disallows crawling outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SITE_URL", "https://www.bakanel.example");

    expect(publicRobotsText()).toBe("User-Agent: *\nDisallow: /\n");
  });

  it("fails closed in production until the authoritative origin is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "");

    expect(publicRobotsText()).toBe("User-Agent: *\nDisallow: /\n");
  });

  it("advertises only the production sitemap and keeps administration out of crawling", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://www.bakanel.example");

    expect(publicRobotsText()).toBe(
      "User-Agent: *\nAllow: /\nDisallow: /admin\nSitemap: https://www.bakanel.example/sitemap-index.xml\nHost: https://www.bakanel.example\n",
    );
  });
});
