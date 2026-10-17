import "server-only";

import type { Locale, Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { publicDomainWhere, publicTopicWhere, publicTrainingWhere } from "./eligibility";
import type { PublicLocale } from "./locale";
import { toPrismaLocale } from "./locale";
import { trainingCatalogueHref } from "./training-routes";

/**
 * The navigation is intentionally smaller than the catalogue. The catalogue URL returned with
 * every response remains the complete, paginated path when a hierarchy exceeds these limits.
 */
export const PUBLIC_TRAINING_NAVIGATION_DOMAIN_LIMIT = 12;
export const PUBLIC_TRAINING_NAVIGATION_TOPIC_LIMIT = 8;

export type PublicTrainingNavigationTopic = {
  name: string;
  slug: string;
};

export type PublicTrainingNavigationDomain = PublicTrainingNavigationTopic & {
  topics: PublicTrainingNavigationTopic[];
};

export type PublicTrainingNavigation = {
  catalogueHref: string;
  domains: PublicTrainingNavigationDomain[];
};

function publishedTranslation(locale: Locale) {
  return {
    where: { locale, isPublished: true },
    select: { name: true, slug: true },
    take: 1,
  };
}

function eligibleTopicWhere(locale: PublicLocale): Prisma.TrainingTopicWhereInput {
  return {
    ...publicTopicWhere(locale),
    trainings: { some: publicTrainingWhere(locale) },
  };
}

/**
 * Returns only requested-locale taxonomy labels that contain an eligible public programme.
 * Internal identifiers, lifecycle state, and untranslated labels never leave this boundary.
 */
export function createPublicTrainingNavigationReader(client: PrismaClient) {
  return {
    async getPublicTrainingNavigation(locale: PublicLocale): Promise<PublicTrainingNavigation> {
      const prismaLocale = toPrismaLocale(locale);
      const translation = publishedTranslation(prismaLocale);
      const topicWhere = eligibleTopicWhere(locale);
      const domains = await client.trainingDomain.findMany({
        where: {
          ...publicDomainWhere(locale),
          topics: { some: topicWhere },
        },
        select: {
          translations: translation,
          topics: {
            where: topicWhere,
            select: { translations: translation },
            orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
            take: PUBLIC_TRAINING_NAVIGATION_TOPIC_LIMIT,
          },
        },
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        take: PUBLIC_TRAINING_NAVIGATION_DOMAIN_LIMIT,
      });

      return {
        catalogueHref: trainingCatalogueHref(locale),
        domains: domains.flatMap((domain) => {
          const domainTranslation = domain.translations[0];
          if (!domainTranslation) {
            return [];
          }

          const topics = domain.topics.flatMap((topic) => {
            const topicTranslation = topic.translations[0];
            return topicTranslation ? [topicTranslation] : [];
          });

          return topics.length > 0 ? [{ ...domainTranslation, topics }] : [];
        }),
      };
    },
  };
}

export const publicTrainingNavigationReader = createPublicTrainingNavigationReader(prisma);
