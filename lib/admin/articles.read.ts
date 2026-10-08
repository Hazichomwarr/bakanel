import "server-only";

import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const translationSelection = {
  select: {
    locale: true,
    slug: true,
    title: true,
    excerpt: true,
    content: true,
    isPublished: true,
  },
} as const;

export function createAdminArticlesReader(client: PrismaClient) {
  return {
    list: () =>
      client.article.findMany({
        select: {
          id: true,
          status: true,
          coverReference: true,
          publishedAt: true,
          createdAt: true,
          translations: {
            select: { locale: true, title: true, isPublished: true },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      }),
    detail: (articleId: string) =>
      client.article.findUnique({
        where: { id: articleId },
        select: {
          id: true,
          status: true,
          coverReference: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          translations: translationSelection,
        },
      }),
  };
}

export const adminArticlesReader = createAdminArticlesReader(prisma);
