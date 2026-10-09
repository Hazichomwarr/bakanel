import "server-only";

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { PublicArticleDto, PublicArticleSummaryDto } from "./dto";
import { publicArticleWhere } from "./eligibility";
import type { PublicLocale } from "./locale";
import { toPrismaLocale } from "./locale";
import { publicOffset, publicPageSize, type PublicListOptions } from "./pagination";

type SelectedArticleSummary = {
  coverReference: string | null;
  publishedAt: Date | null;
  translations: Array<{
    slug: string;
    title: string;
    excerpt: string | null;
  }>;
};

type SelectedArticle = {
  coverReference: string | null;
  publishedAt: Date | null;
  translations: Array<{
    slug: string;
    title: string;
    excerpt: string | null;
    content: string | null;
  }>;
};

function toPublicArticleSummaryDto(
  article: SelectedArticleSummary,
): PublicArticleSummaryDto | null {
  const translation = article.translations[0];

  if (!translation || !article.publishedAt) {
    return null;
  }

  return {
    slug: translation.slug,
    title: translation.title,
    excerpt: translation.excerpt,
    coverReference: article.coverReference,
    publishedAt: article.publishedAt,
  };
}

function toPublicArticleDto(article: SelectedArticle): PublicArticleDto | null {
  const translation = article.translations[0];

  if (!translation || !article.publishedAt) {
    return null;
  }

  return {
    slug: translation.slug,
    title: translation.title,
    excerpt: translation.excerpt,
    content: translation.content,
    coverReference: article.coverReference,
    publishedAt: article.publishedAt,
  };
}

export function createPublicArticleReader(client: PrismaClient) {
  return {
    async listPublicArticles(
      locale: PublicLocale,
      options: PublicListOptions = {},
    ): Promise<PublicArticleSummaryDto[]> {
      const prismaLocale = toPrismaLocale(locale);

      const articles = await client.article.findMany({
        where: publicArticleWhere(locale),
        select: {
          coverReference: true,
          publishedAt: true,
          translations: {
            where: { locale: prismaLocale, isPublished: true },
            select: {
              slug: true,
              title: true,
              excerpt: true,
            },
            take: 1,
          },
        },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        skip: publicOffset(options.offset),
        take: publicPageSize(options.limit),
      });

      return articles.flatMap((article) => {
        const dto = toPublicArticleSummaryDto(article);
        return dto ? [dto] : [];
      });
    },

    async getPublicArticleBySlug(
      locale: PublicLocale,
      slug: string,
    ): Promise<PublicArticleDto | null> {
      const normalizedSlug = slug.trim();

      if (!normalizedSlug) {
        return null;
      }

      const prismaLocale = toPrismaLocale(locale);
      const publishedLocalizedSlug = {
        locale: prismaLocale,
        slug: normalizedSlug,
        isPublished: true,
      };

      const article = await client.article.findFirst({
        where: {
          ...publicArticleWhere(locale),
          translations: { some: publishedLocalizedSlug },
        },
        select: {
          coverReference: true,
          publishedAt: true,
          translations: {
            where: publishedLocalizedSlug,
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

      return article ? toPublicArticleDto(article) : null;
    },
  };
}

export const publicArticleReader = createPublicArticleReader(prisma);
