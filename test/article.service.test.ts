/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArticleStatus, Locale, Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { ArticleDomainError } from "../lib/article.errors";
import { createArticleService } from "../lib/article.service";

const matches = (row: any, where: any) => Object.entries(where).every(([field, value]) => row[field] === value);
const copy = <T>(row: T | undefined) => (row ? structuredClone(row) : null);
const uniqueViolation = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`locale`,`slug`)", { code: "P2002", clientVersion: Prisma.prismaVersion.client, meta: { target: ["locale", "slug"] } });

// In-memory Prisma boundary enforcing ArticleTranslation's @@unique([locale, slug]). Reads return copies;
// `beforeNextWrite` runs a competing writer between the service's read and its conditional write.
function createStore() {
  const articles = new Map<string, any>();
  const translations = new Map<string, any>();
  let pending: (() => void) | undefined;
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const translationKey = (articleId: string, locale: Locale) => `${articleId}:${locale}`;
  const slugTaken = (locale: Locale, slug: string, except?: any) => [...translations.values()].some(row => row !== except && row.locale === locale && row.slug === slug);
  const racePoint = () => { const competingWriter = pending; pending = undefined; competingWriter?.(); };
  const store: any = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(store),
    article: {
      create: async ({ data }: any) => {
        const row = { id: nextId("article"), status: ArticleStatus.DRAFT, coverReference: null, publishedAt: null, ...data };
        articles.set(row.id, row);
        return copy(row);
      },
      findUnique: async ({ where }: any) => copy(articles.get(where.id)),
      updateMany: async ({ where, data }: any) => {
        racePoint();
        const row = articles.get(where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }: any) => {
        racePoint();
        const row = articles.get(where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        articles.delete(where.id);
        return { count: 1 };
      },
    },
    articleTranslation: {
      createMany: async ({ data, skipDuplicates }: any) => {
        racePoint();
        const duplicate = translations.has(translationKey(data.articleId, data.locale)) || slugTaken(data.locale, data.slug);
        if (duplicate) {
          if (skipDuplicates) return { count: 0 };
          throw uniqueViolation();
        }
        translations.set(translationKey(data.articleId, data.locale), { id: nextId("translation"), isPublished: false, ...data });
        return { count: 1 };
      },
      findUnique: async ({ where }: any) => {
        if (where.id) return copy([...translations.values()].find(row => row.id === where.id));
        const { articleId, locale } = where.articleId_locale;
        return copy(translations.get(translationKey(articleId, locale)));
      },
      updateMany: async ({ where, data }: any) => {
        racePoint();
        const row = [...translations.values()].find(candidate => candidate.id === where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        if (data.slug !== undefined && slugTaken(row.locale, data.slug, row)) throw uniqueViolation();
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  return {
    store,
    articles,
    translation: (articleId: string, locale: Locale) => translations.get(translationKey(articleId, locale)),
    beforeNextWrite: (competingWriter: () => void) => (pending = competingWriter),
    hasPendingWriter: () => pending !== undefined,
    flushConcurrentWriter: racePoint,
  };
}

function setup() {
  const fake = createStore();
  const clock = { now: new Date("2026-03-01T09:00:00.000Z") };
  const service = createArticleService(fake.store as PrismaClient, () => new Date(clock.now));
  const advance = (iso: string) => (clock.now = new Date(iso));
  return { fake, service, advance };
}

function expectCode(promise: Promise<unknown>, code: ArticleDomainError["code"]) {
  return expect(promise).rejects.toEqual(expect.objectContaining({ name: "ArticleDomainError", code }));
}

const complete = (locale: Locale, slug: string) => ({ locale, slug, title: "Titre", content: "Contenu" });

describe("Article service", () => {
  describe("lifecycle", () => {
    it.each([
      ["DRAFT → PUBLISHED", ArticleStatus.DRAFT, "publishArticle", ArticleStatus.PUBLISHED],
      ["DRAFT → ARCHIVED", ArticleStatus.DRAFT, "archiveArticle", ArticleStatus.ARCHIVED],
      ["PUBLISHED → ARCHIVED", ArticleStatus.PUBLISHED, "archiveArticle", ArticleStatus.ARCHIVED],
      ["ARCHIVED → PUBLISHED", ArticleStatus.ARCHIVED, "publishArticle", ArticleStatus.PUBLISHED],
    ] as const)("permits %s", async (_label, from, operation, to) => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      fake.articles.get(article.id).status = from;
      expect(await service[operation](article.id)).toMatchObject({ status: to });
      expect(fake.articles.get(article.id).status).toBe(to);
    });

    it.each([
      ["PUBLISHED → PUBLISHED", ArticleStatus.PUBLISHED, "publishArticle"],
      ["ARCHIVED → ARCHIVED", ArticleStatus.ARCHIVED, "archiveArticle"],
    ] as const)("rejects %s without mutation", async (_label, from, operation) => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      Object.assign(fake.articles.get(article.id), { status: from, publishedAt: new Date("2026-01-01T00:00:00.000Z") });
      const before = structuredClone(fake.articles.get(article.id));
      await expectCode(service[operation](article.id), "INVALID_ARTICLE_TRANSITION");
      expect(fake.articles.get(article.id)).toEqual(before);
    });

    it("rejects lifecycle operations on a missing article", async () => {
      const { service } = setup();
      await expectCode(service.publishArticle("missing"), "ARTICLE_NOT_FOUND");
      await expectCode(service.archiveArticle("missing"), "ARTICLE_NOT_FOUND");
      await expectCode(service.updateArticle("missing", { coverReference: "x" }), "ARTICLE_NOT_FOUND");
    });

    it("rejects stale publish and archive conditional writes", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      fake.beforeNextWrite(() => (fake.articles.get(article.id).status = ArticleStatus.ARCHIVED));
      await expectCode(service.publishArticle(article.id), "STALE_ARTICLE_STATE");
      expect(fake.articles.get(article.id)).toMatchObject({ status: ArticleStatus.ARCHIVED, publishedAt: null });

      fake.beforeNextWrite(() => (fake.articles.get(article.id).status = ArticleStatus.PUBLISHED));
      await expectCode(service.publishArticle(article.id), "STALE_ARTICLE_STATE");

      fake.beforeNextWrite(() => (fake.articles.get(article.id).status = ArticleStatus.ARCHIVED));
      await expectCode(service.archiveArticle(article.id), "STALE_ARTICLE_STATE");
    });

    it("rejects a stale editorial update when the article changed state concurrently", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle("cover-1");
      fake.beforeNextWrite(() => (fake.articles.get(article.id).status = ArticleStatus.PUBLISHED));
      await expectCode(service.updateArticle(article.id, { coverReference: "cover-2" }), "STALE_ARTICLE_STATE");
      expect(fake.articles.get(article.id).coverReference).toBe("cover-1");
    });
  });

  describe("publishedAt", () => {
    it("is set on first publication and preserved through archive, republish, and editing", async () => {
      const { fake, service, advance } = setup();
      const article = await service.createArticle();
      expect(fake.articles.get(article.id).publishedAt).toBeNull();

      advance("2026-03-02T10:00:00.000Z");
      await service.publishArticle(article.id);
      const firstPublication = new Date("2026-03-02T10:00:00.000Z");
      expect(fake.articles.get(article.id).publishedAt).toEqual(firstPublication);

      advance("2026-03-05T10:00:00.000Z");
      await service.updateArticle(article.id, { coverReference: "cover-2" });
      await service.upsertArticleTranslation(article.id, complete(Locale.FR, "article"));
      await service.publishArticleTranslation(article.id, Locale.FR);
      await service.updateArticle(article.id, { publishedAt: new Date("2030-01-01T00:00:00.000Z"), status: ArticleStatus.DRAFT } as any);
      expect(fake.articles.get(article.id)).toMatchObject({ status: ArticleStatus.PUBLISHED, publishedAt: firstPublication });

      advance("2026-04-01T10:00:00.000Z");
      await service.archiveArticle(article.id);
      expect(fake.articles.get(article.id)).toMatchObject({ status: ArticleStatus.ARCHIVED, publishedAt: firstPublication });

      advance("2026-05-01T10:00:00.000Z");
      await service.publishArticle(article.id);
      expect(fake.articles.get(article.id)).toMatchObject({ status: ArticleStatus.PUBLISHED, publishedAt: firstPublication });
    });

    it("stays unset when a DRAFT is archived and is established when that archive is first published", async () => {
      const { fake, service, advance } = setup();
      const article = await service.createArticle();
      await service.archiveArticle(article.id);
      expect(fake.articles.get(article.id).publishedAt).toBeNull();
      advance("2026-03-10T08:00:00.000Z");
      await service.publishArticle(article.id);
      expect(fake.articles.get(article.id).publishedAt).toEqual(new Date("2026-03-10T08:00:00.000Z"));
    });
  });

  describe("published editing", () => {
    it("a PUBLISHED article still accepts cover and translation copy edits", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle("  covers/a.jpg ");
      expect(fake.articles.get(article.id).coverReference).toBe("covers/a.jpg");
      await service.upsertArticleTranslation(article.id, complete(Locale.FR, "qualite"));
      await service.publishArticleTranslation(article.id, Locale.FR);
      await service.publishArticle(article.id);

      expect(await service.updateArticle(article.id, { coverReference: "covers/b.jpg" })).toMatchObject({ coverReference: "covers/b.jpg", status: ArticleStatus.PUBLISHED });
      await service.updateArticle(article.id, {});
      expect(fake.articles.get(article.id).coverReference).toBe("covers/b.jpg");
      await service.updateArticle(article.id, { coverReference: "  " });
      expect(fake.articles.get(article.id).coverReference).toBeNull();

      await service.upsertArticleTranslation(article.id, { locale: Locale.FR, slug: "Qualité Totale", title: "  Nouveau titre ", excerpt: " Résumé ", content: "Nouveau contenu" });
      expect(fake.translation(article.id, Locale.FR)).toMatchObject({ slug: "qualite-totale", title: "Nouveau titre", excerpt: "Résumé", content: "Nouveau contenu", isPublished: true });
      expect(fake.articles.get(article.id).status).toBe(ArticleStatus.PUBLISHED);
    });

    it("refuses an edit that would strip a published translation of its required copy", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      await service.upsertArticleTranslation(article.id, complete(Locale.FR, "qualite"));
      await service.publishArticleTranslation(article.id, Locale.FR);
      await expectCode(service.upsertArticleTranslation(article.id, { ...complete(Locale.FR, "qualite"), content: "  " }), "INVALID_ARTICLE_TRANSLATION");
      await expectCode(service.upsertArticleTranslation(article.id, { ...complete(Locale.FR, "qualite"), title: "  " }), "INVALID_ARTICLE_TRANSLATION");
      expect(fake.translation(article.id, Locale.FR)).toMatchObject({ title: "Titre", content: "Contenu", isPublished: true });
    });
  });

  describe("translation publication", () => {
    it.each([
      ["title", { title: "   " }],
      ["content", { content: "   " }],
      ["content (absent)", { content: undefined }],
    ])("requires %s", async (_field, override) => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      await service.upsertArticleTranslation(article.id, { ...complete(Locale.FR, "article"), ...override });
      await expectCode(service.publishArticleTranslation(article.id, Locale.FR), "INVALID_ARTICLE_TRANSLATION");
      expect(fake.translation(article.id, Locale.FR).isPublished).toBe(false);
    });

    it("requires a URL-safe slug, reported as an Article error", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      await expectCode(service.upsertArticleTranslation(article.id, { ...complete(Locale.FR, "x"), slug: "  " }), "INVALID_ARTICLE_TRANSLATION");
      await expectCode(service.upsertArticleTranslation(article.id, { ...complete(Locale.FR, "x"), slug: "!!!" }), "INVALID_ARTICLE_TRANSLATION");
      expect(fake.translation(article.id, Locale.FR)).toBeUndefined();
    });

    it("treats excerpt as optional", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      await service.upsertArticleTranslation(article.id, { ...complete(Locale.EN, "article"), excerpt: "  " });
      await service.publishArticleTranslation(article.id, Locale.EN);
      expect(fake.translation(article.id, Locale.EN)).toMatchObject({ excerpt: null, isPublished: true });
    });

    it("publishes one locale independently of the others and of the Article status", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      for (const locale of [Locale.FR, Locale.EN, Locale.PT]) await service.upsertArticleTranslation(article.id, complete(locale, "article"));

      await service.publishArticleTranslation(article.id, Locale.FR);
      expect(fake.translation(article.id, Locale.FR).isPublished).toBe(true);
      expect(fake.translation(article.id, Locale.EN).isPublished).toBe(false);
      expect(fake.translation(article.id, Locale.PT).isPublished).toBe(false);
      expect(fake.articles.get(article.id)).toMatchObject({ status: ArticleStatus.DRAFT, publishedAt: null });

      await service.unpublishArticleTranslation(article.id, Locale.FR);
      expect(fake.translation(article.id, Locale.FR).isPublished).toBe(false);
      expect(fake.articles.get(article.id).status).toBe(ArticleStatus.DRAFT);
    });

    it("publishing the Article does not publish its translations", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      await service.upsertArticleTranslation(article.id, complete(Locale.FR, "article"));
      await service.upsertArticleTranslation(article.id, complete(Locale.EN, "article"));
      await service.publishArticle(article.id);
      expect(fake.translation(article.id, Locale.FR).isPublished).toBe(false);
      expect(fake.translation(article.id, Locale.EN).isPublished).toBe(false);
    });

    it("rejects missing translations and stale translation publication", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      await expectCode(service.publishArticleTranslation(article.id, Locale.PT), "ARTICLE_TRANSLATION_NOT_FOUND");
      await expectCode(service.upsertArticleTranslation("missing", complete(Locale.FR, "article")), "ARTICLE_NOT_FOUND");
      await service.upsertArticleTranslation(article.id, complete(Locale.FR, "article"));
      fake.beforeNextWrite(() => (fake.translation(article.id, Locale.FR).isPublished = true));
      await expectCode(service.publishArticleTranslation(article.id, Locale.FR), "STALE_ARTICLE_STATE");
    });
  });

  describe("slug conflict", () => {
    it("maps the Prisma unique-constraint failure to ARTICLE_SLUG_CONFLICT", async () => {
      const { fake, service } = setup();
      const first = await service.createArticle();
      const second = await service.createArticle();
      await service.upsertArticleTranslation(first.id, complete(Locale.FR, "qualite"));

      const conflict = service.upsertArticleTranslation(second.id, complete(Locale.FR, " Qualité "));
      await expectCode(conflict, "ARTICLE_SLUG_CONFLICT");
      await expect(conflict).rejects.not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(fake.translation(second.id, Locale.FR)).toBeUndefined();

      await service.upsertArticleTranslation(second.id, complete(Locale.EN, "qualite"));
      expect(fake.translation(second.id, Locale.EN).slug).toBe("qualite");
    });

    it("does not disguise unrelated persistence failures as slug conflicts", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      const outage = new Error("connection reset");
      fake.store.articleTranslation.createMany = async () => { throw outage; };
      await expect(service.upsertArticleTranslation(article.id, complete(Locale.FR, "article"))).rejects.toBe(outage);
      const working = setup();
      const existing = await working.service.createArticle();
      await working.service.upsertArticleTranslation(existing.id, complete(Locale.FR, "article"));
      working.fake.store.articleTranslation.updateMany = async () => { throw outage; };
      await expect(working.service.upsertArticleTranslation(existing.id, complete(Locale.FR, "article-2"))).rejects.toBe(outage);
    });
  });

  describe("deletion", () => {
    it("deletes a DRAFT article", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      await service.deleteArticleDraft(article.id);
      expect(fake.articles.has(article.id)).toBe(false);
      await expectCode(service.deleteArticleDraft(article.id), "ARTICLE_NOT_FOUND");
    });

    it.each([ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED])("preserves a %s article", async status => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      fake.articles.get(article.id).status = status;
      await expectCode(service.deleteArticleDraft(article.id), "ARTICLE_ESTABLISHED");
      expect(fake.articles.get(article.id).status).toBe(status);
    });

    it("a concurrent publication defeats a stale draft deletion", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      fake.beforeNextWrite(() => Object.assign(fake.articles.get(article.id), { status: ArticleStatus.PUBLISHED, publishedAt: new Date() }));
      await expectCode(service.deleteArticleDraft(article.id), "STALE_ARTICLE_STATE");
      expect(fake.articles.get(article.id).status).toBe(ArticleStatus.PUBLISHED);
    });
  });

  describe("published translation invariant under concurrency", () => {
    async function unpublishedValid() {
      const { fake, service } = setup();
      const article = await service.createArticle();
      await service.upsertArticleTranslation(article.id, { ...complete(Locale.FR, "qualite"), excerpt: "Résumé" });
      const publishConcurrently = () => (fake.translation(article.id, Locale.FR).isPublished = true);
      return { fake, service, id: article.id, publishConcurrently };
    }
    const expectPublishedAndValid = (row: any) => {
      expect(row).toMatchObject({ isPublished: true, title: "Titre", slug: "qualite", content: "Contenu", excerpt: "Résumé" });
      expect(row.title.trim() && row.slug.trim() && row.content?.trim()).toBeTruthy();
    };

    it.each([
      ["blank title", { title: "   " }],
      ["blank content", { content: "  " }],
      ["absent content", { content: null }],
    ])("an edit to %s loses to a translation published between its read and write", async (_label, override) => {
      const { fake, service, id, publishConcurrently } = await unpublishedValid();
      fake.beforeNextWrite(publishConcurrently);
      await expectCode(service.upsertArticleTranslation(id, { ...complete(Locale.FR, "qualite"), ...override }), "STALE_ARTICLE_STATE");
      expectPublishedAndValid(fake.translation(id, Locale.FR));
    });

    it.each([["blank", "   "], ["invalid", "!!!"]])("a %s slug is rejected before any read, so a concurrent publication keeps a valid slug", async (_label, slug) => {
      const { fake, service, id, publishConcurrently } = await unpublishedValid();
      fake.beforeNextWrite(publishConcurrently);
      await expectCode(service.upsertArticleTranslation(id, { ...complete(Locale.FR, "x"), slug }), "INVALID_ARTICLE_TRANSLATION");
      expect(fake.hasPendingWriter()).toBe(true);
      fake.flushConcurrentWriter();
      expectPublishedAndValid(fake.translation(id, Locale.FR));
    });

    it("a valid edit still succeeds against a concurrently published translation", async () => {
      const { fake, service, id, publishConcurrently } = await unpublishedValid();
      fake.beforeNextWrite(publishConcurrently);
      await service.upsertArticleTranslation(id, { locale: Locale.FR, slug: "qualite-2", title: "Titre 2", content: "Contenu 2" });
      expect(fake.translation(id, Locale.FR)).toMatchObject({ isPublished: true, slug: "qualite-2", title: "Titre 2", content: "Contenu 2", excerpt: null });
    });

    it.each([
      ["title blanked", { title: "" }],
      ["content blanked", { content: null }],
      ["slug changed", { slug: "autre" }],
    ])("publication validated against stale copy loses when the copy was %s between its read and write", async (_label, concurrentEdit) => {
      const { fake, service, id } = await unpublishedValid();
      fake.beforeNextWrite(() => Object.assign(fake.translation(id, Locale.FR), concurrentEdit));
      await expectCode(service.publishArticleTranslation(id, Locale.FR), "STALE_ARTICLE_STATE");
      expect(fake.translation(id, Locale.FR)).toMatchObject({ isPublished: false, ...concurrentEdit });
    });

    it("a first-time create racing a concurrent same-locale create is stale, not a slug conflict, and leaves the winner intact", async () => {
      const { fake, service } = setup();
      const article = await service.createArticle();
      fake.beforeNextWrite(() => {
        void fake.store.articleTranslation.createMany({ data: { articleId: article.id, locale: Locale.FR, slug: "gagnant", title: "Titre", excerpt: null, content: "Contenu" } });
        fake.translation(article.id, Locale.FR).isPublished = true;
      });
      await expectCode(service.upsertArticleTranslation(article.id, { ...complete(Locale.FR, "perdant"), title: " " }), "STALE_ARTICLE_STATE");
      expect(fake.translation(article.id, Locale.FR)).toMatchObject({ slug: "gagnant", title: "Titre", content: "Contenu", isPublished: true });
    });

    it("maps a unique-constraint failure on an existing translation's slug change to ARTICLE_SLUG_CONFLICT", async () => {
      const { fake, service } = setup();
      const first = await service.createArticle();
      const second = await service.createArticle();
      await service.upsertArticleTranslation(first.id, complete(Locale.FR, "qualite"));
      await service.upsertArticleTranslation(second.id, complete(Locale.FR, "securite"));
      const conflict = service.upsertArticleTranslation(second.id, complete(Locale.FR, "qualite"));
      await expectCode(conflict, "ARTICLE_SLUG_CONFLICT");
      await expect(conflict).rejects.not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(fake.translation(second.id, Locale.FR).slug).toBe("securite");
    });
  });
});
