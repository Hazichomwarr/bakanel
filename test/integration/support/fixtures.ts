import type { PrismaClient } from "@prisma/client";

import { TEST_DATABASE_NAME, UnsafeTestDatabaseError } from "./test-database-guard";

/** Every fixture text value starts with this marker so test-owned rows are identifiable. */
export const FIXTURE_PREFIX = "it-";

// Child tables first is not required with CASCADE, but the list is explicit so that only
// application tables in the disposable database are ever truncated.
const APPLICATION_TABLES = [
  "TrainingSessionExpert",
  "TrainingSession",
  "TrainingTranslation",
  "Training",
  "TrainingTopicTranslation",
  "TrainingTopic",
  "TrainingDomainTranslation",
  "TrainingDomain",
  "ExpertTranslation",
  "Expert",
  "ClientEngagementTranslation",
  "ClientEngagement",
  "ClientOrganization",
  "ArticleTranslation",
  "Article",
];

/**
 * Empties the public-content tables. Re-checks the connected database first so the
 * truncation can only ever run inside `bakanel_test`.
 */
export async function resetPublicContent(client: PrismaClient) {
  const rows = await client.$queryRaw<Array<{ database_name: string }>>`
    select current_database() as database_name
  `;

  if (rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new UnsafeTestDatabaseError(`connected database is not "${TEST_DATABASE_NAME}".`);
  }

  const tableList = APPLICATION_TABLES.map((table) => `"${table}"`).join(", ");
  await client.$executeRawUnsafe(`truncate table ${tableList} restart identity cascade`);
}

type FixtureLocale = "FR" | "EN" | "PT";

type CatalogueTranslationFixture = {
  locale: FixtureLocale;
  slug: string;
  isPublished?: boolean;
};

type CatalogueStatusFixture = "DRAFT" | "PUBLISHED" | "ARCHIVED";

function catalogueTranslations(translations: CatalogueTranslationFixture[]) {
  return translations.map((translation) => ({
    locale: translation.locale,
    name: `${FIXTURE_PREFIX}${translation.slug}`,
    slug: `${FIXTURE_PREFIX}${translation.slug}`,
    isPublished: translation.isPublished ?? true,
  }));
}

export function createDomain(
  client: PrismaClient,
  input: {
    status?: CatalogueStatusFixture;
    displayOrder?: number;
    translations: CatalogueTranslationFixture[];
  },
) {
  return client.trainingDomain.create({
    data: {
      status: input.status ?? "PUBLISHED",
      displayOrder: input.displayOrder ?? 0,
      translations: { create: catalogueTranslations(input.translations) },
    },
  });
}

export function createTopic(
  client: PrismaClient,
  input: {
    trainingDomainId: string;
    status?: CatalogueStatusFixture;
    displayOrder?: number;
    translations: CatalogueTranslationFixture[];
  },
) {
  return client.trainingTopic.create({
    data: {
      trainingDomainId: input.trainingDomainId,
      status: input.status ?? "PUBLISHED",
      displayOrder: input.displayOrder ?? 0,
      translations: { create: catalogueTranslations(input.translations) },
    },
  });
}

export function createTraining(
  client: PrismaClient,
  input: {
    trainingTopicId: string;
    status?: CatalogueStatusFixture;
    createdAt?: Date;
    translations: CatalogueTranslationFixture[];
  },
) {
  return client.training.create({
    data: {
      trainingTopicId: input.trainingTopicId,
      status: input.status ?? "PUBLISHED",
      createdAt: input.createdAt,
      translations: {
        create: input.translations.map((translation) => ({
          locale: translation.locale,
          slug: `${FIXTURE_PREFIX}${translation.slug}`,
          title: `${FIXTURE_PREFIX}${translation.slug} title`,
          summary: `${FIXTURE_PREFIX}${translation.slug} summary`,
          description: `${FIXTURE_PREFIX}${translation.slug} description`,
          isPublished: translation.isPublished ?? true,
        })),
      },
    },
  });
}

/**
 * A training whose domain, topic, and training are all PUBLISHED with published translations
 * for the given locales.
 */
export async function createPublishedTraining(
  client: PrismaClient,
  slug: string,
  locales: FixtureLocale[] = ["FR"],
) {
  const translationsFor = (suffix: string) =>
    locales.map((locale) => ({ locale, slug: `${slug}-${suffix}-${locale.toLowerCase()}` }));

  const domain = await createDomain(client, { translations: translationsFor("domain") });
  const topic = await createTopic(client, {
    trainingDomainId: domain.id,
    translations: translationsFor("topic"),
  });

  return createTraining(client, {
    trainingTopicId: topic.id,
    translations: locales.map((locale) => ({ locale, slug: `${slug}-${locale.toLowerCase()}` })),
  });
}
