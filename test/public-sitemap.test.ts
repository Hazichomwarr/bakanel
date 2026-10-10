import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const countPublicTrainingSitemapEntries = vi.hoisted(() => vi.fn());
const listPublicTrainingSitemapEntries = vi.hoisted(() => vi.fn());

vi.mock("@/lib/public/training-sitemap.read", () => ({
  TRAINING_SITEMAP_PAGE_SIZE: 40_000,
  publicTrainingSitemapReader: {
    countPublicTrainingSitemapEntries,
    listPublicTrainingSitemapEntries,
  },
}));

import { getPublicSitemapEntries, listPublicSitemapIds } from "../lib/public/sitemap";

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://www.bakanel.example");
  countPublicTrainingSitemapEntries.mockReset();
  listPublicTrainingSitemapEntries.mockReset();
  countPublicTrainingSitemapEntries.mockResolvedValue(0);
  listPublicTrainingSitemapEntries.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public sitemap", () => {
  it("includes the localized public routes but never administration", async () => {
    const entries = await getPublicSitemapEntries("static");
    expect(entries).not.toBeNull();
    const sitemapEntries = entries!;
    const urls = sitemapEntries.map((entry) => entry.url);

    expect(urls).toContain("https://www.bakanel.example/fr");
    expect(urls).toContain("https://www.bakanel.example/en/formations");
    expect(urls).toContain("https://www.bakanel.example/pt/services/iso");
    expect(urls.some((url) => url.includes("/admin"))).toBe(false);

    const frenchHomepage = sitemapEntries.find(
      (entry) => entry.url === "https://www.bakanel.example/fr",
    );
    expect(frenchHomepage?.alternates?.languages).toEqual({
      fr: "https://www.bakanel.example/fr",
      en: "https://www.bakanel.example/en",
      pt: "https://www.bakanel.example/pt",
    });
  });

  it("splits eligible programme entries into bounded sitemap pages", async () => {
    countPublicTrainingSitemapEntries.mockImplementation((locale: string) =>
      locale === "fr" ? 40_001 : 0,
    );

    await expect(listPublicSitemapIds()).resolves.toEqual([
      "static",
      "training-fr-0",
      "training-fr-1",
    ]);
  });

  it("uses actual eligible localized slugs and omits missing translations", async () => {
    listPublicTrainingSitemapEntries.mockResolvedValue([
      {
        slug: "gestion-des-sinistres",
        lastModified: new Date("2026-10-01T00:00:00.000Z"),
        alternates: [{ locale: "pt", slug: "gestao-de-sinistros" }],
      },
    ]);

    const entries = await getPublicSitemapEntries("training-fr-0");
    expect(entries).not.toBeNull();
    const sitemapEntries = entries!;

    expect(listPublicTrainingSitemapEntries).toHaveBeenCalledWith("fr", {
      offset: 0,
      limit: 40_000,
    });
    expect(sitemapEntries).toEqual([
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
    expect(sitemapEntries[0].alternates?.languages).not.toHaveProperty("en");
  });

  it("does not query public data until a verified site URL is configured", async () => {
    vi.stubEnv("SITE_URL", "");

    await expect(listPublicSitemapIds()).resolves.toBeNull();
    await expect(getPublicSitemapEntries("static")).resolves.toBeNull();
    expect(countPublicTrainingSitemapEntries).not.toHaveBeenCalled();
    expect(listPublicTrainingSitemapEntries).not.toHaveBeenCalled();
  });

  it("propagates database failures instead of emitting an empty sitemap", async () => {
    countPublicTrainingSitemapEntries.mockRejectedValue(new Error("database unavailable"));

    await expect(listPublicSitemapIds()).rejects.toThrow("database unavailable");
  });
});
