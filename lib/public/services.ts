import type { Metadata } from "next";

import type { PublicDictionary, ServiceContent } from "./content/types";
import type { PublicLocale } from "./locale";

/** The only service route segments. Segments are shared across locales; copy is localized. */
export const serviceSlugs = ["conseil", "formation", "audits", "iso"] as const;

export type ServiceSlug = (typeof serviceSlugs)[number];

/** Professional training is the institute's core activity; the other services complement it. */
export const primaryServiceSlug = "formation" satisfies ServiceSlug;

export const complementaryServiceSlugs = serviceSlugs.filter((slug) => slug !== primaryServiceSlug);

const INSTITUTION_NAME = "W'BAKENEL Consulting Institute";

/** Reviewed static assets only. Database media references are never rendered here. */
export const serviceImages: Record<ServiceSlug, { src: string; position: string }> = {
  conseil: { src: "/images/consulting.png", position: "50% 40%" },
  formation: { src: "/images/training.png", position: "50% 45%" },
  audits: { src: "/images/audit.png", position: "50% 55%" },
  iso: { src: "/images/iso.png", position: "55% 40%" },
};

export function isServiceSlug(value: string): value is ServiceSlug {
  return serviceSlugs.includes(value as ServiceSlug);
}

export function servicesHref(locale: PublicLocale) {
  return `/${locale}/services`;
}

export function serviceHref(locale: PublicLocale, slug: ServiceSlug) {
  return `${servicesHref(locale)}/${slug}`;
}

export function getServiceContent(dictionary: PublicDictionary, slug: ServiceSlug): ServiceContent {
  return dictionary.services.items[slug];
}

export function servicesOverviewMetadata(dictionary: PublicDictionary): Metadata {
  const overview = dictionary.services.overview;

  return {
    title: `${overview.metaTitle} | ${INSTITUTION_NAME}`,
    description: overview.metaDescription,
  };
}

export function serviceDetailMetadata(dictionary: PublicDictionary, slug: ServiceSlug): Metadata {
  const service = getServiceContent(dictionary, slug);

  return {
    title: `${service.name} | ${INSTITUTION_NAME}`,
    description: service.metaDescription,
  };
}
