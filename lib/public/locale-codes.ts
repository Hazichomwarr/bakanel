/**
 * Locale codes without any Prisma import, so the proxy and client components can use them.
 * `locale.ts` re-exports these alongside the Prisma mapping.
 */
export const publicLocales = ["fr", "en", "pt"] as const;

export type PublicLocale = (typeof publicLocales)[number];

export function isPublicLocale(value: string): value is PublicLocale {
  return publicLocales.includes(value as PublicLocale);
}

/**
 * A first path segment that looks like a language tag ("de", "FR", "en-US", "pt_BR") but is
 * not an exact, supported locale. Other unknown segments are deliberately not classified here,
 * so application routes never need to be listed.
 */
const LOCALE_SHAPED_SEGMENT = /^[A-Za-z]{2}(?:[-_][A-Za-z]{2})?$/;

export function isUnsupportedLocalePath(pathname: string) {
  const firstSegment = pathname.split("/")[1] ?? "";

  return LOCALE_SHAPED_SEGMENT.test(firstSegment) && !isPublicLocale(firstSegment);
}
