import { SessionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  isRegistrationOpen,
  publicArticleWhere,
  publicSessionWhere,
  publicReferenceWhere,
  publicTrainingWhere,
  publicDomainWhere,
  publicTopicWhere,
  publicExpertWhere,
  utcCalendarDate,
} from "../lib/public/eligibility";
import { isPublicLocale } from "../lib/public/locale";

describe("public eligibility", () => {
  it("requires published locale translations throughout training ancestry", () => {
    expect(publicTrainingWhere("en")).toMatchObject({
      status: "PUBLISHED",
      translations: { some: { locale: "EN", isPublished: true } },
      trainingTopic: { is: { trainingDomain: { is: { status: "PUBLISHED" } } } },
    });
  });
  it("isolates every catalogue predicate to the requested locale", () => {
    expect(publicDomainWhere("fr")).toMatchObject({
      translations: { some: { locale: "FR", isPublished: true } },
    });
    expect(publicTopicWhere("pt")).toMatchObject({
      translations: { some: { locale: "PT", isPublished: true } },
      trainingDomain: { is: { translations: { some: { locale: "PT", isPublished: true } } } },
    });
    expect(publicTrainingWhere("en")).toMatchObject({
      trainingTopic: {
        is: {
          translations: { some: { locale: "EN", isPublished: true } },
          trainingDomain: { is: { translations: { some: { locale: "EN", isPublished: true } } } },
        },
      },
    });
  });
  it("rejects unsupported URL locales before a predicate can be built", () => {
    expect(isPublicLocale("de")).toBe(false);
    expect(isPublicLocale("FR")).toBe(false);
  });
  it("requires explicitly public completed references and published locale titles", () => {
    expect(publicReferenceWhere("fr")).toMatchObject({
      status: "COMPLETED",
      visibility: "PUBLIC",
      translations: { some: { locale: "FR", isPublished: true, title: { not: "" } } },
    });
  });
  it("requires active experts and published translations", () => {
    expect(publicExpertWhere("fr")).toMatchObject({
      status: "ACTIVE",
      translations: { some: { locale: "FR", isPublished: true } },
    });
  });
  it("requires a historical publication timestamp for articles", () => {
    expect(publicArticleWhere("pt")).toMatchObject({
      status: "PUBLISHED",
      publishedAt: { not: null },
      translations: { some: { locale: "PT", isPublished: true } },
    });
  });
  it("keeps closed upcoming sessions visible but never registration-open", () => {
    const today = new Date("2026-10-08T18:00:00.000Z");
    expect(
      isRegistrationOpen(
        {
          status: SessionStatus.CLOSED,
          startDate: new Date("2026-10-09"),
          registrationDeadline: null,
        },
        today,
      ),
    ).toBe(false);
    expect(
      isRegistrationOpen(
        {
          status: SessionStatus.OPEN,
          startDate: new Date("2026-10-09"),
          registrationDeadline: new Date("2026-10-07"),
        },
        today,
      ),
    ).toBe(false);
    expect(
      isRegistrationOpen(
        {
          status: SessionStatus.OPEN,
          startDate: new Date("2026-10-09"),
          registrationDeadline: null,
        },
        today,
      ),
    ).toBe(true);
    expect(utcCalendarDate(today)).toEqual(new Date("2026-10-08T00:00:00.000Z"));
  });
  it("keeps terminal, draft, past, and untranslated sessions outside the public database predicate", () => {
    expect(publicSessionWhere("pt", new Date("2026-10-08T23:30:00.000Z"))).toEqual({
      status: { in: [SessionStatus.OPEN, SessionStatus.CLOSED] },
      startDate: { gte: new Date("2026-10-08T00:00:00.000Z") },
      training: {
        is: {
          status: "PUBLISHED",
          translations: { some: { locale: "PT", isPublished: true } },
          trainingTopic: {
            is: {
              status: "PUBLISHED",
              translations: { some: { locale: "PT", isPublished: true } },
              trainingDomain: {
                is: {
                  status: "PUBLISHED",
                  translations: { some: { locale: "PT", isPublished: true } },
                },
              },
            },
          },
        },
      },
    });
  });
  it.each([
    ["deadline today", SessionStatus.OPEN, "2026-10-08", true],
    ["past session", SessionStatus.OPEN, "2026-10-07", false],
    ["cancelled session", SessionStatus.CANCELLED, "2026-10-09", false],
    ["completed session", SessionStatus.COMPLETED, "2026-10-09", false],
  ])("handles %s deterministically", (_label, status, startDate, expected) => {
    expect(
      isRegistrationOpen(
        { status, startDate: new Date(startDate), registrationDeadline: new Date("2026-10-08") },
        new Date("2026-10-08T18:00:00.000Z"),
      ),
    ).toBe(expected);
  });
});
