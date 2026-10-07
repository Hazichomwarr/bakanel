import "server-only";

import { Locale, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const domainSelect = {
  id: true,
  status: true,
  displayOrder: true,
  translations: { select: { locale: true, name: true, slug: true, isPublished: true } },
  topics: {
    select: {
      id: true,
      status: true,
      displayOrder: true,
      translations: { select: { locale: true, name: true, slug: true, isPublished: true } },
      trainings: { select: { id: true, status: true, translations: { select: { locale: true, title: true, slug: true, isPublished: true } } } },
    },
    orderBy: { displayOrder: "asc" as const },
  },
} as const;

export function createAdminCatalogueReader(client: PrismaClient) {
  return {
    overview() {
      return client.trainingDomain.findMany({ select: domainSelect, orderBy: { displayOrder: "asc" } });
    },
    domain(id: string) {
      return client.trainingDomain.findUnique({ where: { id }, select: domainSelect });
    },
    topic(id: string) {
      return client.trainingTopic.findUnique({
        where: { id },
        select: {
          id: true, status: true, displayOrder: true, trainingDomainId: true,
          translations: { select: { locale: true, name: true, slug: true, isPublished: true } },
          trainingDomain: { select: { id: true, translations: { select: { locale: true, name: true } } } },
          trainings: { select: { id: true, status: true, translations: { select: { locale: true, title: true } } } },
        },
      });
    },
    training(id: string) {
      return client.training.findUnique({
        where: { id },
        select: {
          id: true, status: true, trainingTopicId: true,
          translations: { select: { locale: true, title: true, slug: true, summary: true, description: true, objectives: true, targetAudience: true, program: true, isPublished: true } },
          trainingTopic: { select: { id: true, trainingDomainId: true, translations: { select: { locale: true, name: true } }, trainingDomain: { select: { id: true, translations: { select: { locale: true, name: true } } } } } },
        },
      });
    },
    selectors() {
      return client.trainingDomain.findMany({
        select: { id: true, translations: { select: { locale: true, name: true } }, topics: { select: { id: true, trainingDomainId: true, translations: { select: { locale: true, name: true } } }, orderBy: { displayOrder: "asc" } } },
        orderBy: { displayOrder: "asc" },
      });
    },
  };
}

export const adminCatalogueReader = createAdminCatalogueReader(prisma);

export const catalogueLocales = [Locale.FR, Locale.EN, Locale.PT] as const;
export const localeLabels: Record<Locale, string> = { FR: "Français", EN: "English", PT: "Português" };
