import "server-only";

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { publicTrainingWhere } from "./eligibility";
import type { PublicTrainingAlternateDto } from "./dto";
import type { PublicLocale } from "./locale";
import { publicLocales, toPrismaLocale } from "./locale";

export const TRAINING_SITEMAP_PAGE_SIZE = 40_000;

type SitemapPageOptions = {
  offset: number;
  limit: number;
};

export type PublicTrainingSitemapEntry = {
  slug: string;
  lastModified: Date;
  alternates: PublicTrainingAlternateDto[];
};

function isSitemapPageOptions(options: SitemapPageOptions) {
  return (
    Number.isInteger(options.offset) &&
    options.offset >= 0 &&
    Number.isInteger(options.limit) &&
    options.limit >= 1 &&
    options.limit <= TRAINING_SITEMAP_PAGE_SIZE
  );
}

/**
 * Bounded sitemap-only listing. Source rows and alternate rows are independently constrained by
 * the public eligibility predicate; internal IDs exist only long enough to join those results.
 */
export function createPublicTrainingSitemapReader(client: PrismaClient) {
  return {
    async countPublicTrainingSitemapEntries(locale: PublicLocale) {
      return client.training.count({ where: publicTrainingWhere(locale) });
    },

    async listPublicTrainingSitemapEntries(
      locale: PublicLocale,
      options: SitemapPageOptions,
    ): Promise<PublicTrainingSitemapEntry[]> {
      if (!isSitemapPageOptions(options)) {
        throw new Error("Invalid public training sitemap page.");
      }

      const prismaLocale = toPrismaLocale(locale);
      const trainings = await client.training.findMany({
        where: publicTrainingWhere(locale),
        select: {
          id: true,
          translations: {
            where: { locale: prismaLocale, isPublished: true },
            select: { slug: true, updatedAt: true },
            take: 1,
          },
        },
        orderBy: { id: "asc" },
        skip: options.offset,
        take: options.limit,
      });

      const trainingIds = trainings.map((training) => training.id);
      const alternateRowsByLocale = await Promise.all(
        publicLocales
          .filter((targetLocale) => targetLocale !== locale)
          .map(async (targetLocale) => {
            const translations = await client.training.findMany({
              where: {
                id: { in: trainingIds },
                AND: [publicTrainingWhere(targetLocale)],
              },
              select: {
                id: true,
                translations: {
                  where: { locale: toPrismaLocale(targetLocale), isPublished: true },
                  select: { slug: true },
                  take: 1,
                },
              },
            });

            return { locale: targetLocale, translations };
          }),
      );

      const alternatesByTrainingId = new Map<string, PublicTrainingAlternateDto[]>();

      for (const { locale: alternateLocale, translations } of alternateRowsByLocale) {
        for (const training of translations) {
          const translation = training.translations[0];

          if (!translation) {
            continue;
          }

          const alternates = alternatesByTrainingId.get(training.id) ?? [];
          alternates.push({ locale: alternateLocale, slug: translation.slug });
          alternatesByTrainingId.set(training.id, alternates);
        }
      }

      return trainings.flatMap((training) => {
        const translation = training.translations[0];

        if (!translation) {
          return [];
        }

        return [
          {
            slug: translation.slug,
            lastModified: translation.updatedAt,
            alternates: alternatesByTrainingId.get(training.id) ?? [],
          },
        ];
      });
    },
  };
}

export const publicTrainingSitemapReader = createPublicTrainingSitemapReader(prisma);
