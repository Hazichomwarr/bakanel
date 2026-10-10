import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listPublicSitemapIds = vi.hoisted(() => vi.fn());

vi.mock("@/lib/public/sitemap", () => ({ listPublicSitemapIds }));

import { GET } from "../app/sitemap-index.xml/route";

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://www.bakanel.example");
  listPublicSitemapIds.mockReset();
  listPublicSitemapIds.mockResolvedValue(["static", "training-fr-0"]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sitemap index", () => {
  it("advertises every generated sitemap using the verified public origin", async () => {
    const response = await GET();

    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    await expect(response.text()).resolves.toBe(
      '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.bakanel.example/sitemap/static.xml</loc></sitemap><sitemap><loc>https://www.bakanel.example/sitemap/training-fr-0.xml</loc></sitemap></sitemapindex>',
    );
  });

  it("does not advertise sitemap routes before deployment config supplies an origin", async () => {
    vi.stubEnv("SITE_URL", "");

    const response = await GET();

    expect(response.status).toBe(404);
    expect(listPublicSitemapIds).not.toHaveBeenCalled();
  });

  it("propagates generation failures instead of serving a misleading index", async () => {
    listPublicSitemapIds.mockRejectedValue(new Error("database unavailable"));

    await expect(GET()).rejects.toThrow("database unavailable");
  });
});
