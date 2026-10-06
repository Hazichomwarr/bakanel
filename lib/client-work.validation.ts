import { EngagementType, Locale } from "@prisma/client";
import { normalizeCountry } from "./training-session.validation";
import { ClientWorkDomainError } from "./client-work.errors";

export const normalizeOptionalText = (value: string | null | undefined) => value?.trim() || null;
export function normalizeOrganizationName(value: string) { const name = value.trim(); if (!name) throw new ClientWorkDomainError("INVALID_CLIENT_ORGANIZATION", "Organization name is required."); return name; }
export function normalizeEngagementDates(startDate: Date | null, endDate: Date | null) {
  if (startDate && endDate && endDate < startDate) throw new ClientWorkDomainError("INVALID_ENGAGEMENT_DATES", "Engagement cannot end before it starts.");
  return { startDate, endDate };
}
export function assertEngagementType(type: EngagementType) { if (!Object.values(EngagementType).includes(type)) throw new ClientWorkDomainError("INVALID_CLIENT_ENGAGEMENT", "Invalid engagement type."); }
export function assertLocale(locale: Locale) { if (!Object.values(Locale).includes(locale)) throw new ClientWorkDomainError("INVALID_ENGAGEMENT_TRANSLATION", "Invalid locale."); }
export { normalizeCountry };
