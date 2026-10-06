import { Locale } from "@prisma/client";
import { ExpertDomainError } from "./expert.errors";

export function normalizeExpertName(value: string) {
  const name = value.trim();
  if (!name) throw new ExpertDomainError("INVALID_EXPERT", "Expert name is required.");
  return name;
}

export function normalizeDisplayOrder(value: number) {
  if (!Number.isInteger(value)) throw new ExpertDomainError("INVALID_EXPERT", "Display order must be an integer.");
  return value;
}

export function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

export function assertExpertLocale(locale: Locale) {
  if (![Locale.FR, Locale.EN, Locale.PT].includes(locale)) throw new ExpertDomainError("INVALID_EXPERT_TRANSLATION", "Unsupported locale.");
}
