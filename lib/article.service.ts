import "server-only";
import { ArticleStatus, Locale, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeSlug } from "./catalogue.validation";
import { ArticleDomainError, type ArticleErrorCode } from "./article.errors";

function fail(code: ArticleErrorCode, message: string): never {
  throw new ArticleDomainError(code, message);
}
const isPrismaCode = (error: unknown, code: string) =>
  typeof error === "object" && error !== null && "code" in error && error.code === code;
const optional = (v: string | null | undefined) => v?.trim() || null;
const locales = (v: Locale) => Object.values(Locale).includes(v);
export function createArticleService(client: PrismaClient, now = () => new Date()) {
  async function article(tx: Prisma.TransactionClient, id: string) {
    const item = await tx.article.findUnique({ where: { id } });
    if (!item) fail("ARTICLE_NOT_FOUND", "Article was not found.");
    return item;
  }
  async function transition(id: string, target: ArticleStatus) {
    return client.$transaction(async (tx) => {
      const current = await article(tx, id);
      const valid =
        (current.status === ArticleStatus.DRAFT &&
          (target === ArticleStatus.PUBLISHED || target === ArticleStatus.ARCHIVED)) ||
        (current.status === ArticleStatus.PUBLISHED && target === ArticleStatus.ARCHIVED) ||
        (current.status === ArticleStatus.ARCHIVED && target === ArticleStatus.PUBLISHED);
      if (!valid) fail("INVALID_ARTICLE_TRANSITION", "Unsupported article transition.");
      const publishedAt =
        target === ArticleStatus.PUBLISHED ? (current.publishedAt ?? now()) : current.publishedAt;
      const r = await tx.article.updateMany({
        where: { id, status: current.status },
        data: { status: target, publishedAt },
      });
      if (!r.count) fail("STALE_ARTICLE_STATE", "Article changed concurrently.");
      return article(tx, id);
    });
  }
  return {
    createArticle: (coverReference?: string | null) =>
      client.article.create({ data: { coverReference: optional(coverReference) } }),
    async createArticleWithTranslation(
      input: { coverReference?: string | null },
      translation: {
        locale: Locale;
        slug: string;
        title: string;
        excerpt?: string | null;
        content?: string | null;
      },
    ) {
      if (!locales(translation.locale)) fail("INVALID_ARTICLE_TRANSLATION", "Invalid locale.");

      let slug: string;
      try {
        slug = normalizeSlug(translation.slug);
      } catch {
        fail("INVALID_ARTICLE_TRANSLATION", "Article slug must contain URL-safe characters.");
      }

      const translationData = {
        locale: translation.locale,
        slug,
        title: translation.title.trim(),
        excerpt: optional(translation.excerpt),
        content: optional(translation.content),
      };

      if (!translationData.title || !translationData.content) {
        fail("INVALID_ARTICLE_TRANSLATION", "Article title and content are required.");
      }

      return client.$transaction(async (transaction) => {
        const article = await transaction.article.create({
          data: { coverReference: optional(input.coverReference) },
        });

        try {
          await transaction.articleTranslation.create({
            data: { articleId: article.id, ...translationData },
          });
        } catch (error) {
          if (isPrismaCode(error, "P2002")) {
            fail("ARTICLE_SLUG_CONFLICT", "Article slug already exists for this locale.");
          }
          throw error;
        }

        return article;
      });
    },
    async updateArticle(id: string, input: { coverReference?: string | null }) {
      return client.$transaction(async (tx) => {
        const current = await article(tx, id);
        const r = await tx.article.updateMany({
          where: { id, status: current.status },
          data: {
            coverReference:
              input.coverReference === undefined
                ? current.coverReference
                : optional(input.coverReference),
          },
        });
        if (!r.count) fail("STALE_ARTICLE_STATE", "Article changed concurrently.");
        return article(tx, id);
      });
    },
    publishArticle: (id: string) => transition(id, ArticleStatus.PUBLISHED),
    archiveArticle: (id: string) => transition(id, ArticleStatus.ARCHIVED),
    async deleteArticleDraft(id: string) {
      return client.$transaction(async (tx) => {
        const current = await article(tx, id);
        if (current.status !== ArticleStatus.DRAFT)
          fail("ARTICLE_ESTABLISHED", "Published and archived articles must be preserved.");
        const r = await tx.article.deleteMany({ where: { id, status: ArticleStatus.DRAFT } });
        if (!r.count) fail("STALE_ARTICLE_STATE", "Article changed concurrently.");
      });
    },
    async upsertArticleTranslation(
      id: string,
      input: {
        locale: Locale;
        slug: string;
        title: string;
        excerpt?: string | null;
        content?: string | null;
      },
    ) {
      if (!locales(input.locale)) fail("INVALID_ARTICLE_TRANSLATION", "Invalid locale.");
      let slug: string;
      try {
        slug = normalizeSlug(input.slug);
      } catch {
        fail("INVALID_ARTICLE_TRANSLATION", "Article slug must contain URL-safe characters.");
      }
      const data = {
        slug,
        title: input.title.trim(),
        excerpt: optional(input.excerpt),
        content: optional(input.content),
      };
      const publishable = Boolean(data.title && data.content);
      return client.$transaction(async (tx) => {
        await article(tx, id);
        const where = { articleId_locale: { articleId: id, locale: input.locale } };
        const existing = await tx.articleTranslation.findUnique({ where });
        if (!existing) {
          const created = await tx.articleTranslation.createMany({
            data: { articleId: id, locale: input.locale, ...data },
            skipDuplicates: true,
          });
          if (created.count) return tx.articleTranslation.findUnique({ where });
          if (await tx.articleTranslation.findUnique({ where }))
            fail("STALE_ARTICLE_STATE", "Article translation changed concurrently.");
          fail("ARTICLE_SLUG_CONFLICT", "Article slug already exists for this locale.");
        }
        if (existing.isPublished && !publishable)
          fail(
            "INVALID_ARTICLE_TRANSLATION",
            "Published article translations require title, slug, and content.",
          );
        try {
          const r = await tx.articleTranslation.updateMany({
            where: publishable ? { id: existing.id } : { id: existing.id, isPublished: false },
            data,
          });
          if (!r.count) fail("STALE_ARTICLE_STATE", "Article translation changed concurrently.");
        } catch (e) {
          if (isPrismaCode(e, "P2002"))
            fail("ARTICLE_SLUG_CONFLICT", "Article slug already exists for this locale.");
          throw e;
        }
        return tx.articleTranslation.findUnique({ where: { id: existing.id } });
      });
    },
    async publishArticleTranslation(id: string, locale: Locale, published = true) {
      if (!locales(locale)) fail("INVALID_ARTICLE_TRANSLATION", "Invalid locale.");
      return client.$transaction(async (tx) => {
        const tr = await tx.articleTranslation.findUnique({
          where: { articleId_locale: { articleId: id, locale } },
        });
        if (!tr) fail("ARTICLE_TRANSLATION_NOT_FOUND", "Article translation was not found.");
        if (published && (!tr.title.trim() || !tr.slug.trim() || !tr.content?.trim()))
          fail("INVALID_ARTICLE_TRANSLATION", "Article title, slug, and content are required.");
        const r = await tx.articleTranslation.updateMany({
          where: {
            id: tr.id,
            isPublished: !published,
            ...(published && { title: tr.title, slug: tr.slug, content: tr.content }),
          },
          data: { isPublished: published },
        });
        if (!r.count && tr.isPublished !== published)
          fail("STALE_ARTICLE_STATE", "Article translation changed concurrently.");
        return tx.articleTranslation.findUnique({ where: { id: tr.id } });
      });
    },
    unpublishArticleTranslation(id: string, locale: Locale) {
      return this.publishArticleTranslation(id, locale, false);
    },
  };
}
export const articleService = createArticleService(prisma);
