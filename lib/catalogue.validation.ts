import { Locale } from "@prisma/client";
import { CatalogueDomainError } from "./catalogue.errors";

export function assertLocale(locale: Locale) {
  if (![Locale.FR, Locale.EN, Locale.PT].includes(locale)) throw new CatalogueDomainError("INVALID_LOCALE", "Unsupported locale.");
}

export function normalizeSlug(value: string) {
  const slug = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new CatalogueDomainError("INVALID_SLUG", "Slug must contain URL-safe characters.");
  return slug;
}

export function assertTranslation(value: string, field: string) {
  if (!value.trim()) throw new CatalogueDomainError("INVALID_TRANSLATION", `${field} is required for publication.`);
}
