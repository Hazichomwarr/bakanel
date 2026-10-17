import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicTrainingNavigation = vi.hoisted(() => vi.fn());

vi.mock("@/lib/public/training-navigation.read", () => ({
  publicTrainingNavigationReader: { getPublicTrainingNavigation },
}));

import { GET } from "../app/api/public/[locale]/training-navigation/route";

function routeContext(locale: string) {
  return { params: Promise.resolve({ locale }) };
}

beforeEach(() => {
  getPublicTrainingNavigation.mockReset();
  getPublicTrainingNavigation.mockResolvedValue({
    catalogueHref: "/fr/formations",
    domains: [{ name: "Assurance", slug: "assurance", topics: [] }],
  });
});

describe("public training navigation route", () => {
  it("returns the locale-scoped public navigation without caching it", async () => {
    const response = await GET(
      new Request("https://local.test/api/public/fr/training-navigation"),
      routeContext("fr"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      catalogueHref: "/fr/formations",
      domains: [{ name: "Assurance", slug: "assurance", topics: [] }],
    });
    expect(getPublicTrainingNavigation).toHaveBeenCalledWith("fr");
  });

  it("rejects unsupported locales before database access", async () => {
    const response = await GET(
      new Request("https://local.test/api/public/de/training-navigation"),
      routeContext("de"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(getPublicTrainingNavigation).not.toHaveBeenCalled();
  });

  it("returns a sanitized unavailable response when the reader fails", async () => {
    getPublicTrainingNavigation.mockRejectedValue(new Error("database password leaked"));

    const response = await GET(
      new Request("https://local.test/api/public/pt/training-navigation"),
      routeContext("pt"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
  });
});
