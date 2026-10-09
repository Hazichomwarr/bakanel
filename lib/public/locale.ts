import { Locale } from "@prisma/client";

import { isPublicLocale, type PublicLocale } from "./locale-codes";

export { isPublicLocale, publicLocales, type PublicLocale } from "./locale-codes";

export function toPrismaLocale(locale: PublicLocale): Locale {
  switch (locale) {
    case "fr":
      return Locale.FR;
    case "en":
      return Locale.EN;
    case "pt":
      return Locale.PT;
    default:
      // Fail closed: an undefined Prisma filter would match every locale.
      throw new Error("Unsupported public locale.");
  }
}
export function publicHref(locale: PublicLocale) {
  return `/${locale}`;
}

/**
 * Returns the same page in another locale. Route segments below the locale are shared, so only
 * the leading locale segment changes; anything outside the public locale tree falls back to the
 * target locale's homepage.
 */
export function localizedPathname(pathname: string, target: PublicLocale) {
  const [, firstSegment, ...rest] = pathname.split("/");

  if (!firstSegment || !isPublicLocale(firstSegment)) {
    return publicHref(target);
  }

  const remainder = rest.filter((segment) => segment.length > 0).join("/");

  return remainder ? `${publicHref(target)}/${remainder}` : publicHref(target);
}
