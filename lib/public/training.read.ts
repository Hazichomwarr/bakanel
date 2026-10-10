import "server-only";

import type { Locale, Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  PublicTrainingAlternateDto,
  PublicTrainingDetailDto,
  PublicTrainingDomainDto,
  PublicTrainingDto,
  PublicTrainingTopicDto,
} from "./dto";
import { publicDomainWhere, publicTopicWhere, publicTrainingWhere } from "./eligibility";
import type { PublicLocale } from "./locale";
import { publicLocales, toPrismaLocale } from "./locale";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

/**
 * Public catalogue order: domain display order, then topic display order, then training
 * creation time. Each level ends with its unique internal ID so equal display orders still
 * produce one deterministic sequence. IDs are only tie-breakers and are never returned.
 */
const PUBLIC_TRAINING_ORDER: Prisma.TrainingOrderByWithRelationInput[] = [
  { trainingTopic: { trainingDomain: { displayOrder: "asc" } } },
  { trainingTopic: { trainingDomainId: "asc" } },
  { trainingTopic: { displayOrder: "asc" } },
  { trainingTopicId: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

type TaxonomyLabel = {
  name: string;
  slug: string;
};

type SelectedTrainingCard = {
  translations: Array<{
    slug: string;
    title: string;
    summary: string | null;
  }>;
  trainingTopic: {
    translations: TaxonomyLabel[];
    trainingDomain: {
      translations: TaxonomyLabel[];
    };
  };
};

type SelectedTrainingDetail = SelectedTrainingCard & {
  translations: Array<{
    slug: string;
    title: string;
    summary: string | null;
    description: string | null;
    objectives: string | null;
    targetAudience: string | null;
    program: string | null;
  }>;
};

function pageSize(requested?: number) {
  if (requested === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(requested) || requested < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(requested, MAX_PAGE_SIZE);
}

function offset(requested?: number) {
  return requested && Number.isInteger(requested) && requested > 0 ? requested : 0;
}

/** A blank optional section is treated as missing so presentation can omit it. */
function optionalText(value: string | null) {
  if (value === null || value.trim() === "") {
    return null;
  }

  return value;
}

/**
 * The requested locale's published domain and topic labels. `publicTrainingWhere` already
 * requires both ancestors and these translations to be published; repeating the locale and
 * `isPublished` here keeps the projection from ever selecting another translation.
 */
function taxonomyLabelSelect(prismaLocale: Locale) {
  const publishedLabel = {
    where: { locale: prismaLocale, isPublished: true },
    select: { name: true, slug: true },
    take: 1,
  };

  return {
    select: {
      translations: publishedLabel,
      trainingDomain: {
        select: { translations: publishedLabel },
      },
    },
  };
}

function trainingCardSelect(
  translationWhere: Prisma.TrainingTranslationWhereInput,
  prismaLocale: Locale,
) {
  return {
    translations: {
      where: translationWhere,
      select: { slug: true, title: true, summary: true },
      take: 1,
    },
    trainingTopic: taxonomyLabelSelect(prismaLocale),
  };
}

function trainingDetailSelect(
  translationWhere: Prisma.TrainingTranslationWhereInput,
  prismaLocale: Locale,
) {
  return {
    translations: {
      where: translationWhere,
      select: {
        slug: true,
        title: true,
        summary: true,
        description: true,
        objectives: true,
        targetAudience: true,
        program: true,
      },
      take: 1,
    },
    trainingTopic: taxonomyLabelSelect(prismaLocale),
  };
}

/** Fails closed: a row missing any requested-locale translation is dropped, never filled in. */
function toPublicTrainingDto(training: SelectedTrainingCard): PublicTrainingDto | null {
  const translation = training.translations[0];
  const topic = training.trainingTopic.translations[0];
  const domain = training.trainingTopic.trainingDomain.translations[0];

  if (!translation || !topic || !domain) {
    return null;
  }

  return {
    slug: translation.slug,
    title: translation.title,
    summary: optionalText(translation.summary),
    domain: { name: domain.name, slug: domain.slug },
    topic: { name: topic.name, slug: topic.slug },
  };
}

function toPublicTrainingDetailDto(
  training: SelectedTrainingDetail,
): PublicTrainingDetailDto | null {
  const card = toPublicTrainingDto(training);
  const translation = training.translations[0];

  if (!card || !translation) {
    return null;
  }

  return {
    ...card,
    description: optionalText(translation.description),
    objectives: optionalText(translation.objectives),
    targetAudience: optionalText(translation.targetAudience),
    program: optionalText(translation.program),
  };
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
        select: trainingCardSelect({ locale: prismaLocale, isPublished: true }, prismaLocale),
        orderBy: PUBLIC_TRAINING_ORDER,
        skip: offset(options.offset),
        take: pageSize(options.limit),
      });

      return trainings.flatMap((training) => {
        const dto = toPublicTrainingDto(training);
        return dto ? [dto] : [];
      });
    },
    async getPublicTrainingBySlug(
      locale: PublicLocale,
      slug: string,
    ): Promise<PublicTrainingDetailDto | null> {
      const prismaLocale = toPrismaLocale(locale);
      const normalizedSlug = slug.trim();
      if (!normalizedSlug) return null;
      const slugTranslation = { locale: prismaLocale, slug: normalizedSlug, isPublished: true };
      const training = await client.training.findFirst({
        where: {
          ...publicTrainingWhere(locale),
          translations: { some: slugTranslation },
        },
        select: trainingDetailSelect(slugTranslation, prismaLocale),
      });

      return training ? toPublicTrainingDetailDto(training) : null;
    },
    /**
     * Published slugs of the same programme in the other public locales. The source slug must
     * be eligible in `locale`, and each alternate must independently satisfy the full public
     * predicate in its own locale (training, topic, domain, and their translations). Slugs are
     * never assumed to match across languages; an ineligible locale is simply absent.
     */
    async listPublicTrainingAlternates(
      locale: PublicLocale,
      slug: string,
    ): Promise<PublicTrainingAlternateDto[]> {
      const prismaLocale = toPrismaLocale(locale);
      const normalizedSlug = slug.trim();
      if (!normalizedSlug) return [];
      const eligibleSource: Prisma.TrainingWhereInput = {
        ...publicTrainingWhere(locale),
        translations: {
          some: { locale: prismaLocale, slug: normalizedSlug, isPublished: true },
        },
      };
      const targetLocales = publicLocales.filter((candidate) => candidate !== locale);

      const alternates = await Promise.all(
        targetLocales.map(async (target): Promise<PublicTrainingAlternateDto | null> => {
          const targetPrismaLocale = toPrismaLocale(target);
          const training = await client.training.findFirst({
            where: { AND: [eligibleSource, publicTrainingWhere(target)] },
            select: {
              translations: {
                where: { locale: targetPrismaLocale, isPublished: true },
                select: { slug: true },
                take: 1,
              },
            },
          });
          const translation = training?.translations[0];

          return translation ? { locale: target, slug: translation.slug } : null;
        }),
      );

      return alternates.filter((alternate) => alternate !== null);
    },
  };
}

export const publicTrainingReader = createPublicTrainingReader(prisma);
