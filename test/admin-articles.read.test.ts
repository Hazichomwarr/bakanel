import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createAdminArticlesReader } from "../lib/admin/articles.read";

describe("admin article reads", () => {
  it("uses a deterministic, bounded editorial directory projection", async () => {
    const article = {
      findMany: vi.fn().mockResolvedValue([{ id: "article-1", status: "DRAFT" }]),
    };
    const reader = createAdminArticlesReader({ article } as unknown as PrismaClient);

    await expect(reader.list()).resolves.toEqual([{ id: "article-1", status: "DRAFT" }]);
    expect(article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        select: expect.objectContaining({
          translations: expect.objectContaining({
            select: expect.objectContaining({ locale: true, isPublished: true }),
          }),
        }),
      }),
    );
  });

  it("returns all saved translations for an article detail, including unpublished ones", async () => {
    const article = {
      findUnique: vi.fn().mockResolvedValue({
        id: "article-1",
        status: "ARCHIVED",
        translations: [{ locale: "FR", isPublished: false, title: "Archive" }],
      }),
    };
    const reader = createAdminArticlesReader({ article } as unknown as PrismaClient);

    await expect(reader.detail("article-1")).resolves.toMatchObject({
      status: "ARCHIVED",
      translations: [{ locale: "FR", isPublished: false }],
    });
    expect(article.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "article-1" } }),
    );
  });
});
