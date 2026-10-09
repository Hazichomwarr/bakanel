import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPublicArticleReader, publicArticleReader } from "@/lib/public/article.read";
import type { PublicLocale } from "@/lib/public/locale";

import { resetPublicContent } from "./support/fixtures";
import { createTestPrismaClient } from "./support/test-prisma";

let client: PrismaClient;
let reader: ReturnType<typeof createPublicArticleReader>;

type ArticleFixture = {
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: string | null;
  translations?: Array<{
    locale: "FR" | "EN" | "PT";
    isPublished?: boolean;
  }>;
};

function createArticle(slug: string, input: ArticleFixture = {}) {
  const translations = input.translations ?? [{ locale: "FR" }];

  return client.article.create({
    data: {
      status: input.status ?? "PUBLISHED",
      coverReference: `/images/it-${slug}.jpg`,
      publishedAt:
        input.publishedAt === null ? null : new Date(input.publishedAt ?? "2026-09-01T08:00:00Z"),
      translations: {
        create: translations.map((translation) => {
          const localizedSlug = `it-${slug}-${translation.locale.toLowerCase()}`;

          return {
            locale: translation.locale,
            slug: localizedSlug,
            title: `${localizedSlug} title`,
            excerpt: `${localizedSlug} excerpt`,
            content: `${localizedSlug} content`,
            isPublished: translation.isPublished ?? true,
          };
        }),
      },
    },
  });
}

beforeAll(() => {
  client = createTestPrismaClient();
  reader = createPublicArticleReader(client);
});

beforeEach(async () => {
  await resetPublicContent(client);
});

afterAll(async () => {
  await client.$disconnect();
});

describe("public article readers against PostgreSQL", () => {
  it("lists and resolves only published articles with a timestamp and published locale translation", async () => {
    await createArticle("published");
    await createArticle("draft", { status: "DRAFT" });
    await createArticle("archived", { status: "ARCHIVED" });
    await createArticle("no-timestamp", { publishedAt: null });
    await createArticle("unpublished-translation", {
      translations: [{ locale: "FR", isPublished: false }],
    });
    await createArticle("english-only", { translations: [{ locale: "EN" }] });

    const articles = await reader.listPublicArticles("fr");

    expect(articles.map((article) => article.slug)).toEqual(["it-published-fr"]);

    for (const hiddenSlug of [
      "it-draft-fr",
      "it-archived-fr",
      "it-no-timestamp-fr",
      "it-unpublished-translation-fr",
      "it-english-only-en",
      "it-guessed-fr",
    ]) {
      await expect(reader.getPublicArticleBySlug("fr", hiddenSlug)).resolves.toBeNull();
    }
  });

  it("isolates locales: a slug resolves only in its own published locale", async () => {
    await createArticle("forum", {
      translations: [{ locale: "FR" }, { locale: "EN", isPublished: false }],
    });

    await expect(reader.getPublicArticleBySlug("fr", "it-forum-fr")).resolves.not.toBeNull();
    await expect(reader.getPublicArticleBySlug("en", "it-forum-en")).resolves.toBeNull();
    await expect(reader.getPublicArticleBySlug("en", "it-forum-fr")).resolves.toBeNull();
    await expect(reader.listPublicArticles("en")).resolves.toEqual([]);
  });

  it("returns a summary without the body and a detail with only approved content", async () => {
    await createArticle("projection", { publishedAt: "2026-09-15T08:00:00Z" });

    const [summary] = await reader.listPublicArticles("fr");
    const detail = await reader.getPublicArticleBySlug("fr", "it-projection-fr");

    expect(summary).toEqual({
      slug: "it-projection-fr",
      title: "it-projection-fr title",
      excerpt: "it-projection-fr excerpt",
      coverReference: "/images/it-projection.jpg",
      publishedAt: new Date("2026-09-15T08:00:00.000Z"),
    });
    expect(detail).toEqual({ ...summary, content: "it-projection-fr content" });
  });

  it("orders by publication time descending, then by ID for identical timestamps", async () => {
    const tiedFirst = await createArticle("tie-a", { publishedAt: "2026-09-10T08:00:00Z" });
    const tiedSecond = await createArticle("tie-b", { publishedAt: "2026-09-10T08:00:00Z" });
    await createArticle("newest", { publishedAt: "2026-09-20T08:00:00Z" });
    await createArticle("oldest", { publishedAt: "2026-08-01T08:00:00Z" });

    const tiedInIdOrder = [tiedFirst, tiedSecond]
      .sort((left, right) => (left.id < right.id ? -1 : 1))
      .map((article) => (article === tiedFirst ? "it-tie-a-fr" : "it-tie-b-fr"));

    const firstPage = await reader.listPublicArticles("fr", { limit: 2 });
    const secondPage = await reader.listPublicArticles("fr", { offset: 2, limit: 2 });

    expect([...firstPage, ...secondPage].map((article) => article.slug)).toEqual([
      "it-newest-fr",
      ...tiedInIdOrder,
      "it-oldest-fr",
    ]);
  });

  it("does not change publishedAt or slugs when reading", async () => {
    const article = await createArticle("stable", { publishedAt: "2026-09-05T08:00:00Z" });
    const archived = await createArticle("kept-archived", { status: "ARCHIVED" });

    await reader.listPublicArticles("fr");
    await reader.getPublicArticleBySlug("fr", "it-stable-fr");
    await reader.getPublicArticleBySlug("fr", "it-kept-archived-fr");

    const stored = await client.article.findUniqueOrThrow({
      where: { id: article.id },
      select: { publishedAt: true, translations: { select: { slug: true } } },
    });
    const storedArchived = await client.article.findUniqueOrThrow({
      where: { id: archived.id },
      select: { status: true },
    });

    expect(stored).toEqual({
      publishedAt: new Date("2026-09-05T08:00:00.000Z"),
      translations: [{ slug: "it-stable-fr" }],
    });
    expect(storedArchived.status).toBe("ARCHIVED");
  });

  it("rejects an unsupported runtime locale for list and detail", async () => {
    await createArticle("locale-guard", { translations: [{ locale: "FR" }, { locale: "EN" }] });

    await expect(reader.listPublicArticles("de" as PublicLocale)).rejects.toThrow(
      "Unsupported public locale.",
    );
    await expect(
      reader.getPublicArticleBySlug("de" as PublicLocale, "it-locale-guard-fr"),
    ).rejects.toThrow("Unsupported public locale.");
  });

  it("cannot fall back to the application Prisma singleton", async () => {
    await expect(publicArticleReader.listPublicArticles("fr")).rejects.toThrow(
      "The application Prisma singleton must not be used in integration tests.",
    );
  });
});
