import { Locale } from "@prisma/client";
export const publicLocales = ["fr", "en", "pt"] as const;
export type PublicLocale = (typeof publicLocales)[number];
export function isPublicLocale(value: string): value is PublicLocale {
  return publicLocales.includes(value as PublicLocale);
}
export function toPrismaLocale(locale: PublicLocale) {
  return { fr: Locale.FR, en: Locale.EN, pt: Locale.PT }[locale];
}
export function publicHref(locale: PublicLocale) {
  return `/${locale}`;
}
