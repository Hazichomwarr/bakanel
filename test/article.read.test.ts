import { ArticleStatus, Locale, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createPublicArticleReader } from "../lib/article.read";
describe("public articles", () => { it("requires published parent and locale translation", async () => { let args: unknown; const reader = createPublicArticleReader({ article: { findMany: async (value: unknown) => { args = value; return []; }, findFirst: async () => null } } as unknown as PrismaClient); await reader.listPublicArticles(Locale.PT); expect(args).toMatchObject({ where: { status: ArticleStatus.PUBLISHED, translations: { some: { locale: Locale.PT, isPublished: true } } }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }] }); }); });
