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

/** Programmes per page in the admin programme list. */
export const ADMIN_PROGRAMME_PAGE_SIZE = 25;

const frenchLabel = {
  where: { locale: Locale.FR },
  select: { name: true },
  take: 1,
} as const;

/**
 * Admin programme list row: every lifecycle status is included, and every translation is
 * listed so untranslated or unpublished locales stay visible to administrators.
 */
const programmeListSelect = {
  id: true,
  status: true,
  translations: {
    select: { locale: true, title: true, isPublished: true },
    orderBy: { locale: "asc" as const },
  },
  trainingTopic: {
    select: {
      translations: frenchLabel,
      trainingDomain: {
        select: { translations: frenchLabel },
      },
    },
  },
} as const;

/** Any value other than a positive integer string falls back to the first page. */
export function adminProgrammePage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return 1;
  }

  const page = Number(value);

  return Number.isSafeInteger(page) ? page : 1;
}

export function createAdminCatalogueReader(client: PrismaClient) {
  return {
    /**
     * One bounded page of programmes, newest first, with a unique ID tie-breaker so pages
     * are deterministic. A page beyond the end (for example a stale link after a draft was
     * deleted) is clamped to the last page rather than shown as an empty catalogue.
     */
    async programmes(requestedPage: number) {
      const total = await client.training.count();
      const pageCount = Math.max(1, Math.ceil(total / ADMIN_PROGRAMME_PAGE_SIZE));
      const page = Math.min(Math.max(1, requestedPage), pageCount);
      const programmes = await client.training.findMany({
        select: programmeListSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * ADMIN_PROGRAMME_PAGE_SIZE,
        take: ADMIN_PROGRAMME_PAGE_SIZE,
      });

      return { programmes, total, page, pageCount };
    },
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
