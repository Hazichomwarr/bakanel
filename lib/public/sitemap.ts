import "server-only";

import type { MetadataRoute } from "next";

import { publicTrainingSitemapReader, TRAINING_SITEMAP_PAGE_SIZE } from "./training-sitemap.read";
import { publicLocales, type PublicLocale } from "./locale";
import { serviceHref, serviceSlugs, servicesHref } from "./services";
import { getPublicSiteUrl, publicAbsoluteUrl } from "./site-url";
import { trainingCatalogueHref, trainingDetailHref } from "./training-routes";

export type PublicSitemapId = "static" | `training-${PublicLocale}-${number}`;

function staticRouteEntries(siteUrl: URL): MetadataRoute.Sitemap {
  const routes: Array<(locale: PublicLocale) => string> = [
    (locale) => `/${locale}`,
    trainingCatalogueHref,
    servicesHref,
    ...serviceSlugs.map((service) => (locale: PublicLocale) => serviceHref(locale, service)),
  ];

  return routes.flatMap((route) => {
    const languages = Object.fromEntries(
      publicLocales.map((locale) => [locale, publicAbsoluteUrl(route(locale), siteUrl)!]),
    );

    return publicLocales.map((locale) => ({
      url: languages[locale],
      alternates: { languages },
    }));
  });
}

function trainingSitemapRoute(id: string) {
  const match = /^training-(fr|en|pt)-(\d+)$/.exec(id);

  if (!match) {
    return null;
  }

  return { locale: match[1] as PublicLocale, page: Number(match[2]) };
}

/**
 * The index calls this at request time. Publication changes therefore alter the shard set without
 * requiring a rebuild, and a database failure is intentionally allowed to reach the caller.
 */
export async function listPublicSitemapIds(): Promise<PublicSitemapId[] | null> {
  if (!getPublicSiteUrl()) {
    return null;
  }

  const counts = await Promise.all(
    publicLocales.map(async (locale) => ({
      locale,
      count: await publicTrainingSitemapReader.countPublicTrainingSitemapEntries(locale),
    })),
  );

  return [
    "static",
    ...counts.flatMap(({ locale, count }) =>
      Array.from(
        { length: Math.ceil(count / TRAINING_SITEMAP_PAGE_SIZE) },
        (_, page) => `training-${locale}-${page}` as PublicSitemapId,
      ),
    ),
  ];
}

/** Returns null for an unconfigured or invalid sitemap ID; database failures are not suppressed. */
export async function getPublicSitemapEntries(
  sitemapId: string,
): Promise<MetadataRoute.Sitemap | null> {
  const siteUrl = getPublicSiteUrl();

  if (!siteUrl) {
    return null;
  }

  if (sitemapId === "static") {
    return staticRouteEntries(siteUrl);
  }

  const route = trainingSitemapRoute(sitemapId);

  if (!route) {
    return null;
  }

  const entries = await publicTrainingSitemapReader.listPublicTrainingSitemapEntries(route.locale, {
    offset: route.page * TRAINING_SITEMAP_PAGE_SIZE,
    limit: TRAINING_SITEMAP_PAGE_SIZE,
  });

  return entries.map((entry) => {
    const languages = Object.fromEntries(
      [{ locale: route.locale, slug: entry.slug }, ...entry.alternates].map((translation) => [
        translation.locale,
        publicAbsoluteUrl(trainingDetailHref(translation.locale, translation.slug), siteUrl)!,
      ]),
    );

    return {
      url: languages[route.locale],
      lastModified: entry.lastModified,
      alternates: { languages },
    };
  });
}
