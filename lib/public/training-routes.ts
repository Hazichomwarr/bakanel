import type { PublicLocale } from "./locale";
import { publicHref } from "./locale";

export function trainingCatalogueHref(locale: PublicLocale) {
  return `${publicHref(locale)}/formations`;
}

export function trainingDetailHref(locale: PublicLocale, slug: string) {
  return `${trainingCatalogueHref(locale)}/${encodeURIComponent(slug)}`;
}
