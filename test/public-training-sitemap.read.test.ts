import { CatalogueStatus, Locale } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  createPublicTrainingSitemapReader,
  TRAINING_SITEMAP_PAGE_SIZE,
} from "../lib/public/training-sitemap.read";

const count = vi.fn();
const findMany = vi.fn();
const client = { training: { count, findMany } } as never;
const reader = createPublicTrainingSitemapReader(client);

beforeEach(() => {
  count.mockReset();
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

describe("public training sitemap reader", () => {
  it("counts only the requested locale's fully eligible published programmes", async () => {
    count.mockResolvedValue(2);

    await expect(reader.countPublicTrainingSitemapEntries("fr")).resolves.toBe(2);

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: CatalogueStatus.PUBLISHED,
        translations: { some: { locale: Locale.FR, isPublished: true } },
      }),
    });
  });

  it("uses bounded source and alternate queries, dropping unpublished translations", async () => {
    findMany
      .mockResolvedValueOnce([
        {
          id: "training-a",
          translations: [
            { slug: "gestion-des-sinistres", updatedAt: new Date("2026-10-01T00:00:00.000Z") },
          ],
        },
      ])
      .mockResolvedValueOnce([{ id: "training-a", translations: [{ slug: "claims-management" }] }])
      .mockResolvedValueOnce([{ id: "training-a", translations: [] }]);

    await expect(
      reader.listPublicTrainingSitemapEntries("fr", { offset: 0, limit: 1 }),
    ).resolves.toEqual([
      {
        slug: "gestion-des-sinistres",
        lastModified: new Date("2026-10-01T00:00:00.000Z"),
        alternates: [{ locale: "en", slug: "claims-management" }],
      },
    ]);

    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: CatalogueStatus.PUBLISHED,
          translations: { some: { locale: Locale.FR, isPublished: true } },
        }),
        skip: 0,
        take: 1,
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["training-a"] },
          AND: [
            expect.objectContaining({
              status: CatalogueStatus.PUBLISHED,
              translations: { some: { locale: Locale.EN, isPublished: true } },
            }),
          ],
        }),
      }),
    );
  });

  it("rejects unbounded or malformed sitemap page requests before querying", async () => {
    await expect(
      reader.listPublicTrainingSitemapEntries("fr", {
        offset: 0,
        limit: TRAINING_SITEMAP_PAGE_SIZE + 1,
      }),
    ).rejects.toThrow("Invalid public training sitemap page.");

    expect(findMany).not.toHaveBeenCalled();
  });

  it("enumerates deterministic adjacent pages without duplicate or missing eligible programmes", async () => {
    const lastModified = new Date("2026-10-01T00:00:00.000Z");

    findMany
      .mockResolvedValueOnce([
        { id: "training-a", translations: [{ slug: "assurance", updatedAt: lastModified }] },
        { id: "training-b", translations: [{ slug: "gestion", updatedAt: lastModified }] },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "training-c", translations: [{ slug: "statistique", updatedAt: lastModified }] },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const firstPage = await reader.listPublicTrainingSitemapEntries("fr", {
      offset: 0,
      limit: 2,
    });
    const secondPage = await reader.listPublicTrainingSitemapEntries("fr", {
      offset: 2,
      limit: 2,
    });
    const slugs = [...firstPage, ...secondPage].map((entry) => entry.slug);

    expect(slugs).toEqual(["assurance", "gestion", "statistique"]);
    expect(new Set(slugs).size).toBe(3);
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ orderBy: { id: "asc" }, skip: 0, take: 2 }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ orderBy: { id: "asc" }, skip: 2, take: 2 }),
    );
  });
});
