import { Locale } from "@prisma/client";
export const publicLocales = ["fr", "en", "pt"] as const;
export type PublicLocale = (typeof publicLocales)[number];
export function isPublicLocale(value: string): value is PublicLocale {
  return publicLocales.includes(value as PublicLocale);
}
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
