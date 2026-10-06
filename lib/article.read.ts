import "server-only";
import { ArticleStatus, Locale, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export function createPublicArticleReader(client: PrismaClient) { const check = (locale: Locale) => { if (!Object.values(Locale).includes(locale)) throw new Error("Invalid locale"); }; return { listPublicArticles(locale: Locale) { check(locale); return client.article.findMany({ where: { status: ArticleStatus.PUBLISHED, translations: { some: { locale, isPublished: true } } }, include: { translations: { where: { locale, isPublished: true } } }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }] }); }, getPublicArticleBySlug(locale: Locale, slug: string) { check(locale); return client.article.findFirst({ where: { status: ArticleStatus.PUBLISHED, translations: { some: { locale, slug, isPublished: true } } }, include: { translations: { where: { locale, slug, isPublished: true } } } }); } }; }
export const publicArticleReader = createPublicArticleReader(prisma);
