import "server-only";

import { CatalogueStatus, Locale, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertLocale } from "./catalogue.validation";

const translation = (locale: Locale) => ({ where: { locale, isPublished: true } });
const published = CatalogueStatus.PUBLISHED;

export function createPublicCatalogueReader(client: PrismaClient) {
  return {
    publicDomains(locale: Locale) {
      assertLocale(locale);
      return client.trainingDomain.findMany({ where: { status: published, translations: { some: { locale, isPublished: true } } }, include: { translations: translation(locale) }, orderBy: { displayOrder: "asc" } });
    },
    publicTopics(trainingDomainId: string, locale: Locale) {
      assertLocale(locale);
      return client.trainingTopic.findMany({ where: { trainingDomainId, status: published, translations: { some: { locale, isPublished: true } }, trainingDomain: { status: published, translations: { some: { locale, isPublished: true } } } }, include: { translations: translation(locale) }, orderBy: { displayOrder: "asc" } });
    },
    publicTrainings(trainingTopicId: string, locale: Locale) {
      assertLocale(locale);
      return client.training.findMany({ where: { trainingTopicId, status: published, translations: { some: { locale, isPublished: true } }, trainingTopic: { status: published, translations: { some: { locale, isPublished: true } }, trainingDomain: { status: published, translations: { some: { locale, isPublished: true } } } } }, include: { translations: translation(locale) } });
    },
    publicTrainingBySlug(slug: string, locale: Locale) {
      assertLocale(locale);
      return client.training.findFirst({ where: { status: published, translations: { some: { locale, slug, isPublished: true } }, trainingTopic: { status: published, translations: { some: { locale, isPublished: true } }, trainingDomain: { status: published, translations: { some: { locale, isPublished: true } } } } }, include: { translations: translation(locale) } });
    },
  };
}
export const publicCatalogueReader = createPublicCatalogueReader(prisma);
