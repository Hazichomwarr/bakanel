import { DeliveryMode, Prisma, PricingMode } from "@prisma/client";

import { TrainingSessionDomainError } from "./training-session.errors";

export const SUPPORTED_CURRENCIES = new Set(["XOF"]);

const regionNames = new Intl.DisplayNames(["en"], { fallback: "none", type: "region" });

export type SessionFacts = {
  startDate: Date;
  endDate: Date;
  registrationDeadline: Date | null;
  deliveryMode: DeliveryMode;
  country: string | null;
  city: string | null;
  venue: string | null;
  pricingMode: PricingMode;
  price: Prisma.Decimal | null;
  currency: string | null;
  capacity: number | null;
};

export function normalizeCalendarDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new TrainingSessionDomainError("INVALID_DATE_RANGE", "A session date must be valid.");
  }

  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function normalizeCountry(value: string): string {
  const country = value.trim().toUpperCase();
  const countryName = /^[A-Z]{2}$/.test(country) ? regionNames.of(country) : undefined;

  if (!countryName || countryName === "Unknown Region") {
    throw new TrainingSessionDomainError("INVALID_COUNTRY", "Country must be a valid ISO 3166-1 alpha-2 code.");
  }

  return country;
}

export function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();

  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new TrainingSessionDomainError("INVALID_CURRENCY", "Currency must be a supported ISO 4217 code.");
  }

  return currency;
}

export function normalizeSessionFacts(facts: SessionFacts): SessionFacts {
  const startDate = normalizeCalendarDate(facts.startDate);
  const endDate = normalizeCalendarDate(facts.endDate);
  const registrationDeadline = facts.registrationDeadline
    ? normalizeCalendarDate(facts.registrationDeadline)
    : null;

  if (endDate < startDate) {
    throw new TrainingSessionDomainError("INVALID_DATE_RANGE", "A session cannot end before it starts.");
  }

  if (registrationDeadline && registrationDeadline > startDate) {
    throw new TrainingSessionDomainError(
      "INVALID_REGISTRATION_DEADLINE",
      "The registration deadline cannot be after the session start date.",
    );
  }

  if (facts.capacity !== null && (!Number.isInteger(facts.capacity) || facts.capacity <= 0)) {
    throw new TrainingSessionDomainError("INVALID_CAPACITY", "Capacity must be a positive integer when provided.");
  }

  if (facts.pricingMode === PricingMode.FIXED) {
    if (!facts.price || facts.price.lessThanOrEqualTo(0) || !facts.currency) {
      throw new TrainingSessionDomainError(
        "INVALID_PRICING",
        "Fixed pricing requires a positive price and currency.",
      );
    }
  } else if (facts.price !== null || facts.currency !== null) {
    throw new TrainingSessionDomainError(
      "INVALID_PRICING",
      "On-request pricing cannot retain a price or currency.",
    );
  }

  const normalizedFacts = {
    ...facts,
    startDate,
    endDate,
    registrationDeadline,
    currency: facts.currency ? normalizeCurrency(facts.currency) : null,
  };

  if (normalizedFacts.deliveryMode === DeliveryMode.ONLINE) {
    if (facts.country !== null || facts.city !== null || facts.venue !== null) {
      throw new TrainingSessionDomainError(
        "INVALID_LOCATION",
        "Online sessions cannot retain physical location fields.",
      );
    }

    return normalizedFacts;
  }

  if (!normalizedFacts.country || !normalizedFacts.city?.trim()) {
    throw new TrainingSessionDomainError(
      "INVALID_LOCATION",
      "In-person sessions require a country and city.",
    );
  }

  return {
    ...normalizedFacts,
    country: normalizeCountry(normalizedFacts.country),
    city: normalizedFacts.city.trim(),
    venue: normalizedFacts.venue?.trim() || null,
  };
}
