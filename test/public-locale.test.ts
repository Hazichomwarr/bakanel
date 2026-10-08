import { Locale } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { dictionaries } from "../lib/public/content";
import { isPublicLocale, publicHref, publicLocales, toPrismaLocale } from "../lib/public/locale";

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
