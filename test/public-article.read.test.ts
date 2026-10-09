import { ArticleStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createPublicArticleReader } from "../lib/public/article.read";

const publishedAt = new Date("2026-09-15T08:00:00.000Z");

function article(overrides: Record<string, unknown> = {}) {
  return {
    id: "internal-article-id",
    status: ArticleStatus.PUBLISHED,
    coverReference: "articles/forum.jpg",
    publishedAt,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    translations: [
      {
        id: "internal-translation-id",
        articleId: "internal-article-id",
        locale: "FR",
        slug: "forum-risques-2026",
        title: "Forum risques 2026",
        excerpt: "Retour sur le forum.",
        content: "Contenu complet.",
        isPublished: true,
      },
    ],
    ...overrides,
  };
}

function readerWithArticles(options: { list?: unknown[]; detail?: unknown } = {}) {
  const articleDelegate = {
    findMany: vi.fn().mockResolvedValue(options.list ?? []),
    findFirst: vi.fn().mockResolvedValue(options.detail ?? null),
  };
  const reader = createPublicArticleReader({ article: articleDelegate } as unknown as PrismaClient);

  return { reader, articleDelegate };
}

const englishEligibility = {
  status: ArticleStatus.PUBLISHED,
  publishedAt: { not: null },
};

describe("public article list reader", () => {
  it("requires PUBLISHED status, a publication timestamp, and a published locale translation", async () => {
    const { reader, articleDelegate } = readerWithArticles();

    await reader.listPublicArticles("en");

    expect(articleDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...englishEligibility,
          translations: { some: { locale: "EN", isPublished: true } },
        },
      }),
    );
  });

  it("excludes DRAFT and ARCHIVED articles in the database predicate", async () => {
    const { reader, articleDelegate } = readerWithArticles();

    await reader.listPublicArticles("fr");

    const where = articleDelegate.findMany.mock.calls[0][0].where;
    expect(where.status).toBe(ArticleStatus.PUBLISHED);
    expect([ArticleStatus.DRAFT, ArticleStatus.ARCHIVED]).not.toContain(where.status);
  });

  it("selects only summary fields of the requested locale's published translation", async () => {
    const { reader, articleDelegate } = readerWithArticles();

    await reader.listPublicArticles("pt");

    const query = articleDelegate.findMany.mock.calls[0][0];
    expect(query.include).toBeUndefined();
    expect(query.select).toEqual({
      coverReference: true,
      publishedAt: true,
      translations: {
        where: { locale: "PT", isPublished: true },
        select: {
          slug: true,
          title: true,
          excerpt: true,
        },
        take: 1,
      },
    });
  });

  it("maps an eligible article to a summary DTO without IDs, body, or admin fields", async () => {
    const { reader } = readerWithArticles({ list: [article()] });

    const articles = await reader.listPublicArticles("fr");

    expect(articles).toEqual([
      {
        slug: "forum-risques-2026",
        title: "Forum risques 2026",
        excerpt: "Retour sur le forum.",
        coverReference: "articles/forum.jpg",
        publishedAt,
      },
    ]);
    expect(JSON.stringify(articles)).not.toMatch(/internal|PUBLISHED|isPublished|updatedAt/);
  });

  it("omits rows lacking a locale translation or publication timestamp", async () => {
    const { reader } = readerWithArticles({
      list: [article({ translations: [] }), article({ publishedAt: null })],
    });

    await expect(reader.listPublicArticles("fr")).resolves.toEqual([]);
  });

  it("orders by publication timestamp with a unique tie-breaker and bounds the page size", async () => {
    const { reader, articleDelegate } = readerWithArticles();

    await reader.listPublicArticles("fr", { offset: 6, limit: 49 });

    expect(articleDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        skip: 6,
        take: 48,
      }),
    );
  });

  it("normalizes invalid pagination to the bounded default", async () => {
    const { reader, articleDelegate } = readerWithArticles();

    await reader.listPublicArticles("fr", { offset: -10, limit: 2.5 });

    expect(articleDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 12 }),
    );
  });
});

describe("public article detail reader", () => {
  it("applies the complete publication predicate and the localized published slug in the query", async () => {
    const { reader, articleDelegate } = readerWithArticles();

    await reader.getPublicArticleBySlug("en", "  risk-forum-2026  ");

    expect(articleDelegate.findFirst).toHaveBeenCalledWith({
      where: {
        ...englishEligibility,
        translations: {
          some: { locale: "EN", slug: "risk-forum-2026", isPublished: true },
        },
      },
      select: {
        coverReference: true,
        publishedAt: true,
        translations: {
          where: { locale: "EN", slug: "risk-forum-2026", isPublished: true },
          select: {
            slug: true,
            title: true,
            excerpt: true,
            content: true,
          },
          take: 1,
        },
      },
    });
  });

  it("returns null for a guessed unpublished, draft, archived, or other-locale slug", async () => {
    const { reader } = readerWithArticles({ detail: null });

    await expect(reader.getPublicArticleBySlug("fr", "brouillon-secret")).resolves.toBeNull();
  });

  it("returns null without querying for an empty slug", async () => {
    const { reader, articleDelegate } = readerWithArticles();

    await expect(reader.getPublicArticleBySlug("fr", "   ")).resolves.toBeNull();

    expect(articleDelegate.findFirst).not.toHaveBeenCalled();
  });

  it("returns null if a row arrives without a publication timestamp or locale translation", async () => {
    const missingTimestamp = readerWithArticles({ detail: article({ publishedAt: null }) });
    const missingTranslation = readerWithArticles({ detail: article({ translations: [] }) });

    await expect(
      missingTimestamp.reader.getPublicArticleBySlug("fr", "forum-risques-2026"),
    ).resolves.toBeNull();
    await expect(
      missingTranslation.reader.getPublicArticleBySlug("fr", "forum-risques-2026"),
    ).resolves.toBeNull();
  });

  it("maps an eligible article to a detail DTO with the original publication timestamp", async () => {
    const { reader } = readerWithArticles({ detail: article() });

    const detail = await reader.getPublicArticleBySlug("fr", "forum-risques-2026");

    expect(detail).toEqual({
      slug: "forum-risques-2026",
      title: "Forum risques 2026",
      excerpt: "Retour sur le forum.",
      content: "Contenu complet.",
      coverReference: "articles/forum.jpg",
      publishedAt,
    });
    expect(JSON.stringify(detail)).not.toMatch(/internal|PUBLISHED|isPublished|updatedAt/);
  });
});
