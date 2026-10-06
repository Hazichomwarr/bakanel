import { DeliveryMode, Prisma, PricingMode } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { TrainingSessionDomainError } from "../lib/training-session.errors";
import { normalizeCountry, normalizeSessionFacts } from "../lib/training-session.validation";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

const validFacts = () => ({
  startDate: date("2026-11-15"),
  endDate: date("2026-11-15"),
  registrationDeadline: date("2026-11-15"),
  deliveryMode: DeliveryMode.IN_PERSON,
  country: "bf",
  city: "Ouagadougou",
  venue: null,
  pricingMode: PricingMode.FIXED,
  price: new Prisma.Decimal("150000"),
  currency: "xof",
  capacity: 25,
});

function expectCode(callback: () => unknown, code: TrainingSessionDomainError["code"]) {
  expect(callback).toThrow(expect.objectContaining({ code }));
}

describe("TrainingSession business validation", () => {
  it("normalizes valid fixed in-person facts", () => {
    const result = normalizeSessionFacts(validFacts());
    expect(result.country).toBe("BF");
    expect(result.currency).toBe("XOF");
  });

  it.each(["BF", "AO", "CI", "TD", "SN", "TG", "BJ", "ML", "NE", "CM", "GH", "FR", "US"])(
    "accepts the ISO alpha-2 country code %s",
    (country) => {
      expect(normalizeCountry(country.toLowerCase())).toBe(country);
    },
  );

  it("accepts valid on-request and online sessions", () => {
    const result = normalizeSessionFacts({
      ...validFacts(),
      deliveryMode: DeliveryMode.ONLINE,
      country: null,
      city: null,
      venue: null,
      pricingMode: PricingMode.ON_REQUEST,
      price: null,
      currency: null,
      capacity: null,
    });
    expect(result.deliveryMode).toBe(DeliveryMode.ONLINE);
  });

  it("rejects dates ending before their start and late registration deadlines", () => {
    expectCode(() => normalizeSessionFacts({ ...validFacts(), endDate: date("2026-11-14") }), "INVALID_DATE_RANGE");
    expectCode(
      () => normalizeSessionFacts({ ...validFacts(), registrationDeadline: date("2026-11-16") }),
      "INVALID_REGISTRATION_DEADLINE",
    );
  });

  it("rejects incomplete or non-positive fixed pricing", () => {
    expectCode(() => normalizeSessionFacts({ ...validFacts(), price: null }), "INVALID_PRICING");
    expectCode(() => normalizeSessionFacts({ ...validFacts(), currency: null }), "INVALID_PRICING");
    expectCode(() => normalizeSessionFacts({ ...validFacts(), price: new Prisma.Decimal(0) }), "INVALID_PRICING");
    expectCode(() => normalizeSessionFacts({ ...validFacts(), price: new Prisma.Decimal(-1) }), "INVALID_PRICING");
  });

  it("rejects price or currency retained for on-request pricing", () => {
    expectCode(
      () => normalizeSessionFacts({ ...validFacts(), pricingMode: PricingMode.ON_REQUEST }),
      "INVALID_PRICING",
    );
  });

  it("rejects unsupported currency and malformed country input", () => {
    expectCode(() => normalizeSessionFacts({ ...validFacts(), currency: "CFA" }), "INVALID_CURRENCY");
    expectCode(() => normalizeSessionFacts({ ...validFacts(), country: "Burkina Faso" }), "INVALID_COUNTRY");
    expectCode(() => normalizeSessionFacts({ ...validFacts(), country: "ZZ" }), "INVALID_COUNTRY");
  });

  it("requires an in-person country and city", () => {
    expectCode(() => normalizeSessionFacts({ ...validFacts(), country: null }), "INVALID_LOCATION");
    expectCode(() => normalizeSessionFacts({ ...validFacts(), city: " " }), "INVALID_LOCATION");
  });

  it("rejects physical fields on online sessions", () => {
    expectCode(
      () => normalizeSessionFacts({ ...validFacts(), deliveryMode: DeliveryMode.ONLINE }),
      "INVALID_LOCATION",
    );
  });

  it("requires optional capacity to be a positive integer", () => {
    expectCode(() => normalizeSessionFacts({ ...validFacts(), capacity: 0 }), "INVALID_CAPACITY");
    expectCode(() => normalizeSessionFacts({ ...validFacts(), capacity: 1.5 }), "INVALID_CAPACITY");
  });
});
