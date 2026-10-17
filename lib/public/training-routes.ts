import type { PublicLocale } from "./locale";
import { isPublicLocale, localizedPublicHref, publicHref } from "./locale";

export function trainingCatalogueHref(locale: PublicLocale) {
  return `${publicHref(locale)}/formations`;
}

export function trainingDetailHref(locale: PublicLocale, slug: string) {
  return `${trainingCatalogueHref(locale)}/${encodeURIComponent(slug)}`;
}

/**
 * Domain and topic slugs are localized. A locale switch therefore clears an active catalogue
 * filter rather than sending its source-language slug to another locale.
 */
export function localizedTrainingCatalogueHref(
  pathname: string,
  target: PublicLocale,
  search = "",
  hash = "",
) {
  const segments = pathname.split("/").filter(Boolean);
  const isCataloguePath =
    segments.length === 2 && isPublicLocale(segments[0]) && segments[1] === "formations";
  const searchParams = new URLSearchParams(search);

  if (isCataloguePath && (searchParams.has("domain") || searchParams.has("topic"))) {
    return trainingCatalogueHref(target);
  }

  return localizedPublicHref(pathname, target, search, hash);
}
