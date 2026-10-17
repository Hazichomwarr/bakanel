import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listPublicTrainings = vi.hoisted(() => vi.fn());
const getPublicTrainingCatalogueFilter = vi.hoisted(() => vi.fn());

vi.mock("@/lib/public/training.read", () => ({
  publicTrainingReader: { getPublicTrainingCatalogueFilter, listPublicTrainings },
}));

import TrainingCataloguePage, { generateMetadata } from "../app/(public)/[locale]/formations/page";
import { WHATSAPP_CONTACT_URL } from "../lib/public/contact";
import { dictionaries } from "../lib/public/content";
import { publicLocales, type PublicLocale } from "../lib/public/locale";

const publishedTraining = {
  slug: "gestion-des-sinistres",
  title: "Gestion des sinistres",
  summary: "Un programme publié pour les professionnels de l'assurance.",
  domain: { name: "Assurance", slug: "assurance" },
  topic: { name: "Sinistres", slug: "sinistres" },
};

function routeProps(
  locale: string,
  searchParams: {
    domain?: string | string[];
    page?: string | string[];
    topic?: string | string[];
  } = {},
) {
  return {
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(searchParams),
  };
}

function readableText(markup: string) {
  return markup.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

async function renderCatalogue(
  locale: string,
  searchParams: {
    domain?: string | string[];
    page?: string | string[];
    topic?: string | string[];
  } = {},
) {
  const pageComponent = await TrainingCataloguePage(routeProps(locale, searchParams));
  return readableText(renderToStaticMarkup(pageComponent));
}

function unreachableDatabaseError() {
  return new Prisma.PrismaClientKnownRequestError(
    "Can't reach database server at postgres://admin:secret@db.internal:5432",
    { code: "P1001", clientVersion: "test" },
  );
}

beforeEach(() => {
  listPublicTrainings.mockReset();
  listPublicTrainings.mockResolvedValue([]);
  getPublicTrainingCatalogueFilter.mockReset();
  getPublicTrainingCatalogueFilter.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public training catalogue route", () => {
  it("renders only the eligible programme DTO returned by the canonical reader", async () => {
    listPublicTrainings.mockResolvedValue([publishedTraining]);

    const markup = await renderCatalogue("fr");

    expect(listPublicTrainings).toHaveBeenCalledWith("fr", { offset: 0, limit: 13 });
    expect(markup).toContain(publishedTraining.title);
    expect(markup).toContain(publishedTraining.summary);
    expect(markup).toContain(publishedTraining.domain.name);
    expect(markup).toContain(publishedTraining.topic.name);
    expect(markup).not.toContain("Brouillon");
    expect(markup).not.toContain("ARCHIVED");
  });

  it("links each eligible card to its localized programme detail and retains WhatsApp enquiries", async () => {
    listPublicTrainings.mockResolvedValue([publishedTraining]);

    const markup = await renderCatalogue("fr");

    expect(markup).toContain(`href="${WHATSAPP_CONTACT_URL}"`);
    expect(markup).toContain(`href="/fr/formations/${publishedTraining.slug}"`);
    expect(markup).toContain(dictionaries.fr.trainingCatalogue.detailLabel);
    expect(markup).toContain(
      `${dictionaries.fr.trainingCatalogue.enquiryLabel}: ${publishedTraining.title}`,
    );
  });

  it("uses a bounded lookahead and validated server-side page value", async () => {
    listPublicTrainings.mockResolvedValue([
      ...Array.from({ length: 12 }, (_, index) => ({
        ...publishedTraining,
        slug: `programme-${index + 1}`,
        title: `Programme ${index + 1}`,
      })),
      { ...publishedTraining, slug: "programme-13", title: "Programme 13" },
    ]);

    const markup = await renderCatalogue("en", { page: "2" });

    expect(listPublicTrainings).toHaveBeenCalledWith("en", { offset: 12, limit: 13 });
    expect(markup).toContain('href="/en/formations?page=3"');
    expect(markup).toContain('href="/en/formations"');

    await renderCatalogue("en", { page: "2.5" });
    expect(listPublicTrainings).toHaveBeenLastCalledWith("en", { offset: 0, limit: 13 });

    await renderCatalogue("en", { page: ["2", "3"] });
    expect(listPublicTrainings).toHaveBeenLastCalledWith("en", { offset: 0, limit: 13 });
  });

  it("renders the localized empty state only after an empty reader result", async () => {
    const markup = await renderCatalogue("pt");

    expect(markup).toContain(dictionaries.pt.trainingCatalogue.emptyTitle);
    expect(markup).toContain(dictionaries.pt.trainingCatalogue.emptyDescription);
    expect(markup).not.toContain(dictionaries.pt.trainingCatalogue.unavailableTitle);
  });

  it("returns an empty later page to the first page instead of calling the catalogue empty", async () => {
    await expect(TrainingCataloguePage(routeProps("fr", { page: "2" }))).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(listPublicTrainings).toHaveBeenCalledWith("fr", { offset: 12, limit: 13 });
  });

  it("renders an unavailable state and logs no connection details for database errors", async () => {
    const error = unreachableDatabaseError();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    listPublicTrainings.mockRejectedValue(error);

    const markup = await renderCatalogue("fr");

    expect(markup).toContain(dictionaries.fr.trainingCatalogue.unavailableTitle);
    expect(markup).not.toContain(dictionaries.fr.trainingCatalogue.emptyTitle);
    expect(consoleError).toHaveBeenCalledWith(
      "Public training catalogue unavailable (PrismaClientKnownRequestError:P1001).",
    );
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringMatching(/secret|postgres|db\.internal/),
    );
  });

  it("uses an eligible domain filter inside the reader query and retains it through pagination", async () => {
    const filter = { kind: "domain" as const, slug: "assurance", name: "Assurance" };
    getPublicTrainingCatalogueFilter.mockResolvedValue(filter);
    listPublicTrainings.mockResolvedValue([
      ...Array.from({ length: 12 }, (_, index) => ({
        ...publishedTraining,
        slug: `programme-${index + 1}`,
        title: `Programme ${index + 1}`,
      })),
      { ...publishedTraining, slug: "programme-13", title: "Programme 13" },
    ]);

    const markup = await renderCatalogue("fr", { domain: "assurance", page: "2" });

    expect(getPublicTrainingCatalogueFilter).toHaveBeenCalledWith("fr", {
      kind: "domain",
      slug: "assurance",
    });
    expect(listPublicTrainings).toHaveBeenCalledWith("fr", {
      offset: 12,
      limit: 13,
      filter,
    });
    expect(markup).toContain("Filtré par:");
    expect(markup).toContain("Domaine — Assurance");
    expect(markup).toContain('href="/fr/formations?domain=assurance&page=3"');
    expect(markup).toContain('href="/fr/formations?domain=assurance"');
  });

  it("fails closed for unknown or conflicting filters without exposing labels or querying programmes", async () => {
    const unknownMarkup = await renderCatalogue("en", { topic: "unknown-topic" });

    expect(getPublicTrainingCatalogueFilter).toHaveBeenCalledWith("en", {
      kind: "topic",
      slug: "unknown-topic",
    });
    expect(listPublicTrainings).not.toHaveBeenCalled();
    expect(unknownMarkup).toContain(dictionaries.en.trainingCatalogue.filteredEmptyTitle);
    expect(unknownMarkup).not.toContain("unknown-topic");

    getPublicTrainingCatalogueFilter.mockClear();
    const conflictingMarkup = await renderCatalogue("en", {
      domain: "insurance",
      topic: "claims",
    });

    expect(getPublicTrainingCatalogueFilter).not.toHaveBeenCalled();
    expect(listPublicTrainings).not.toHaveBeenCalled();
    expect(conflictingMarkup).toContain(dictionaries.en.trainingCatalogue.filteredEmptyDescription);
  });

  it("keeps the route locale-specific in metadata and complete in every supported locale", async () => {
    const titles = new Set<unknown>();

    for (const locale of publicLocales) {
      const metadata = await generateMetadata(routeProps(locale));
      const catalogue = dictionaries[locale].trainingCatalogue;

      expect(metadata).toEqual({
        title: `${catalogue.metaTitle} | W'BAKENEL Consulting Institute`,
        description: catalogue.metaDescription,
        alternates: {
          canonical: `/${locale}/formations`,
          languages: {
            fr: "/fr/formations",
            en: "/en/formations",
            pt: "/pt/formations",
          },
        },
      });
      titles.add(metadata.title);
    }

    expect(titles.size).toBe(3);
  });

  it.each(["de", "FR", "__proto__"])("rejects unsupported locale %s", async (locale) => {
    await expect(renderCatalogue(locale)).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });
});

describe("training catalogue translations", () => {
  it.each(publicLocales)("provides complete catalogue copy in %s", (locale: PublicLocale) => {
    const copy = Object.values(dictionaries[locale].trainingCatalogue);

    expect(copy.every((value) => value.trim().length > 0)).toBe(true);
  });

  it("does not use French catalogue copy as an English or Portuguese fallback", () => {
    for (const locale of ["en", "pt"] as const) {
      const translated = dictionaries[locale].trainingCatalogue;

      expect(translated.title).not.toBe(dictionaries.fr.trainingCatalogue.title);
      expect(translated.description).not.toBe(dictionaries.fr.trainingCatalogue.description);
      expect(translated.enquiryLabel).not.toBe(dictionaries.fr.trainingCatalogue.enquiryLabel);
      expect(translated.emptyTitle).not.toBe(dictionaries.fr.trainingCatalogue.emptyTitle);
      expect(translated.unavailableTitle).not.toBe(
        dictionaries.fr.trainingCatalogue.unavailableTitle,
      );
    }
  });
});
