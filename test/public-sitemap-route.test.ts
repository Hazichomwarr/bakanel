import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicSitemapEntries = vi.hoisted(() => vi.fn());

vi.mock("@/lib/public/sitemap", () => ({ getPublicSitemapEntries }));

import { GET } from "../app/sitemap/[sitemap]/route";

beforeEach(() => {
  getPublicSitemapEntries.mockReset();
  getPublicSitemapEntries.mockResolvedValue([
    {
      url: "https://www.bakanel.example/fr/formations/gestion-des-sinistres",
      lastModified: new Date("2026-10-01T00:00:00.000Z"),
      alternates: {
        languages: {
          fr: "https://www.bakanel.example/fr/formations/gestion-des-sinistres",
          pt: "https://www.bakanel.example/pt/formations/gestao-de-sinistros",
        },
      },
    },
  ]);
});

describe("public sitemap route", () => {
  it("renders an XML shard from the request-time public entries", async () => {
    const response = await GET(new Request("https://local.test/sitemap/training-fr-0.xml"), {
      params: Promise.resolve({ sitemap: "training-fr-0.xml" }),
    });

    expect(getPublicSitemapEntries).toHaveBeenCalledWith("training-fr-0");
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    await expect(response.text()).resolves.toContain(
      "https://www.bakanel.example/fr/formations/gestion-des-sinistres",
    );
  });

  it("does not expose sitemap data for invalid or unavailable shard requests", async () => {
    const invalidResponse = await GET(new Request("https://local.test/sitemap/static"), {
      params: Promise.resolve({ sitemap: "static" }),
    });

    getPublicSitemapEntries.mockResolvedValue(null);
    const unavailableResponse = await GET(
      new Request("https://local.test/sitemap/training-fr-0.xml"),
      { params: Promise.resolve({ sitemap: "training-fr-0.xml" }) },
    );

    expect(invalidResponse.status).toBe(404);
    expect(unavailableResponse.status).toBe(404);
  });

  it("propagates reader failures instead of sending an empty XML response", async () => {
    getPublicSitemapEntries.mockRejectedValue(new Error("database unavailable"));

    await expect(
      GET(new Request("https://local.test/sitemap/training-fr-0.xml"), {
        params: Promise.resolve({ sitemap: "training-fr-0.xml" }),
      }),
    ).rejects.toThrow("database unavailable");
  });
});
