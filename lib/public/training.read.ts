import "server-only";

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { PublicTrainingDomainDto, PublicTrainingDto, PublicTrainingTopicDto } from "./dto";
import { publicDomainWhere, publicTopicWhere, publicTrainingWhere } from "./eligibility";
import type { PublicLocale } from "./locale";
import { toPrismaLocale } from "./locale";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

function pageSize(requested?: number) {
  if (requested === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(requested) || requested < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(requested, MAX_PAGE_SIZE);
}

function offset(requested?: number) {
  return requested && Number.isInteger(requested) && requested > 0 ? requested : 0;
}

export function createPublicTrainingReader(client: PrismaClient) {
  return {
    async listPublicTrainingDomains(locale: PublicLocale): Promise<PublicTrainingDomainDto[]> {
      const prismaLocale = toPrismaLocale(locale);
      const domains = await client.trainingDomain.findMany({
        where: publicDomainWhere(locale),
        select: {
          translations: {
            where: { locale: prismaLocale, isPublished: true },
            select: { name: true, slug: true },
            take: 1,
          },
        },
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        take: MAX_PAGE_SIZE,
      });
      return domains.flatMap((domain) =>
        domain.translations.map((translation) => ({
          name: translation.name,
          slug: translation.slug,
        })),
      );
    },
    async listPublicTrainingTopics(
      locale: PublicLocale,
      options: { offset?: number; limit?: number } = {},
    ): Promise<PublicTrainingTopicDto[]> {
      const prismaLocale = toPrismaLocale(locale);
      const topics = await client.trainingTopic.findMany({
        where: publicTopicWhere(locale),
        select: {
          translations: {
            where: { locale: prismaLocale, isPublished: true },
            select: { name: true, slug: true },
            take: 1,
          },
        },
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        skip: offset(options.offset),
        take: pageSize(options.limit),
      });
      return topics.flatMap((topic) =>
        topic.translations.map((translation) => ({
          name: translation.name,
          slug: translation.slug,
        })),
      );
    },
    async listPublicTrainings(
      locale: PublicLocale,
      options: { offset?: number; limit?: number } = {},
    ): Promise<PublicTrainingDto[]> {
      const prismaLocale = toPrismaLocale(locale);
      const trainings = await client.training.findMany({
        where: publicTrainingWhere(locale),
        select: {
          translations: {
            where: { locale: prismaLocale, isPublished: true },
            select: { slug: true, title: true, summary: true },
            take: 1,
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: offset(options.offset),
        take: pageSize(options.limit),
      });
      return trainings.flatMap((training) =>
        training.translations.map((translation) => ({
          slug: translation.slug,
          title: translation.title,
          summary: translation.summary,
        })),
      );
    },
    async getPublicTrainingBySlug(
      locale: PublicLocale,
      slug: string,
    ): Promise<PublicTrainingDto | null> {
      const normalizedSlug = slug.trim();
      if (!normalizedSlug) return null;
      const prismaLocale = toPrismaLocale(locale);
      const training = await client.training.findFirst({
        where: {
          ...publicTrainingWhere(locale),
          translations: { some: { locale: prismaLocale, slug: normalizedSlug, isPublished: true } },
        },
        select: {
          translations: {
            where: { locale: prismaLocale, slug: normalizedSlug, isPublished: true },
            select: { slug: true, title: true, summary: true },
            take: 1,
          },
        },
      });
      const translation = training?.translations[0];
      return translation
        ? { slug: translation.slug, title: translation.title, summary: translation.summary }
        : null;
    },
  };
}

export const publicTrainingReader = createPublicTrainingReader(prisma);
