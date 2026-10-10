import type { Metadata } from "next";

import { publicHref, publicLocales, type PublicLocale } from "./locale";

export function localizedAlternates(
  pathname: (locale: PublicLocale) => string,
  locale: PublicLocale,
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: pathname(locale),
    languages: Object.fromEntries(
      publicLocales.map((targetLocale) => [targetLocale, pathname(targetLocale)]),
    ),
  };
}

export function homepageAlternates(locale: PublicLocale) {
  return localizedAlternates(publicHref, locale);
}
