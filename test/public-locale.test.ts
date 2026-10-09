import { Locale } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { dictionaries } from "../lib/public/content";
import {
  publicArticleWhere,
  publicDomainWhere,
  publicExpertWhere,
  publicReferenceWhere,
  publicSessionWhere,
  publicTopicWhere,
  publicTrainingWhere,
} from "../lib/public/eligibility";
import {
  isPublicLocale,
  publicHref,
  publicLocales,
  toPrismaLocale,
  type PublicLocale,
} from "../lib/public/locale";

describe("public locale foundation", () => {
  it.each(["fr", "en", "pt"])("accepts enabled locale %s", (locale) => {
    expect(isPublicLocale(locale)).toBe(true);
  });

  it("rejects unsupported locale values", () => {
    expect(isPublicLocale("admin")).toBe(false);
    expect(isPublicLocale("FR")).toBe(false);
  });

  it("maps URL locales to Prisma locales and homepage URLs", () => {
    expect(toPrismaLocale("fr")).toBe(Locale.FR);
    expect(toPrismaLocale("en")).toBe(Locale.EN);
    expect(toPrismaLocale("pt")).toBe(Locale.PT);
    expect(publicLocales.map(publicHref)).toEqual(["/fr", "/en", "/pt"]);
  });

  it("rejects an unvalidated runtime locale instead of dropping the locale filter", () => {
    expect(() => toPrismaLocale("de" as PublicLocale)).toThrow("Unsupported public locale.");
    expect(() => toPrismaLocale("constructor" as PublicLocale)).toThrow(
      "Unsupported public locale.",
    );
  });

  it.each([
    ["domain", (locale: PublicLocale) => publicDomainWhere(locale)],
    ["topic", (locale: PublicLocale) => publicTopicWhere(locale)],
    ["training", (locale: PublicLocale) => publicTrainingWhere(locale)],
    ["session", (locale: PublicLocale) => publicSessionWhere(locale, new Date())],
    ["expert", (locale: PublicLocale) => publicExpertWhere(locale)],
    ["reference", (locale: PublicLocale) => publicReferenceWhere(locale)],
    ["article", (locale: PublicLocale) => publicArticleWhere(locale)],
  ])("refuses to build a %s publication predicate for an unsupported locale", (_name, build) => {
    for (const unsupported of ["de", "FR", "", "constructor", "__proto__"]) {
      expect(() => build(unsupported as PublicLocale)).toThrow("Unsupported public locale.");
    }
  });

  it("provides complete locale-specific shell copy without a fallback", () => {
    for (const locale of publicLocales) {
      expect(dictionaries[locale]).toMatchObject({
        contact: expect.any(String),
        descriptor: expect.any(String),
        preparing: expect.any(String),
        skipToContent: expect.any(String),
      });
      expect(dictionaries[locale].contact.length).toBeGreaterThan(0);
    }
    expect(dictionaries.fr.contact).not.toBe(dictionaries.en.contact);
  });
});
