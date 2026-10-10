import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Page-level tests reach the real public training reader; only the Prisma query is replaced.
const trainingFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { training: { findMany: trainingFindMany } } }));

import { HomeHero } from "../app/(public)/[locale]/_components/home-hero";
import {
  HOME_TRAINING_SECTION_ID,
  HomeTrainingDomains,
} from "../app/(public)/[locale]/_components/home-training-domains";
import { HomeTrainingPreview } from "../app/(public)/[locale]/_components/home-training-preview";
import PublicHomepage from "../app/(public)/[locale]/page";
import { dictionaries } from "../lib/public/content";
import {
  getHomepageTrainingPreview,
  HOMEPAGE_TRAINING_LIMIT,
  type HomepageTrainingPreview,
  WHATSAPP_CONTACT_URL,
} from "../lib/public/homepage";
import { publicTrainingWhere } from "../lib/public/eligibility";
import { isPublicLocale, publicLocales, type PublicLocale } from "../lib/public/locale";
import { serviceHref } from "../lib/public/services";
import { priorityTrainingDomain, trainingDomainKeys } from "../lib/public/training-domains";

function allStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(allStrings);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(allStrings);
  }

  return [];
}

function homepageCopy(locale: PublicLocale) {
  return allStrings([dictionaries[locale].home, dictionaries[locale].trainingDomains]);
}

/** React escapes apostrophes and ampersands; decode them so copy can be compared verbatim. */
function readableText(markup: string) {
  return markup.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

function hrefs(markup: string) {
  return [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

function renderPreview(locale: PublicLocale, preview: HomepageTrainingPreview) {
  return readableText(
    renderToStaticMarkup(
      createElement(HomeTrainingPreview, { dictionary: dictionaries[locale].home, preview }),
    ),
  );
}

async function renderHomepage(locale: string) {
  const page = await PublicHomepage({ params: Promise.resolve({ locale }) });

  return readableText(renderToStaticMarkup(page));
}

const publishedTaxonomy = {
  domain: { name: "Assurance", slug: "assurance" },
  topic: { name: "Sinistres", slug: "sinistres" },
};

const publishedTraining = {
  slug: "gestion-des-sinistres",
  title: "Gestion des sinistres",
  summary: "Résumé publié.",
  ...publishedTaxonomy,
};

const CONNECTION_DETAILS = /secret|postgres|db\.internal/;
const CLIENT_VERSION = "test";

function unreachableDatabaseError() {
  return new Prisma.PrismaClientKnownRequestError(
    "Can't reach database server at postgres://admin:secret@db.internal:5432",
    { code: "P1001", clientVersion: CLIENT_VERSION },
  );
}

function failingReader(error: unknown) {
  return { listPublicTrainings: vi.fn().mockRejectedValue(error) };
}

beforeEach(() => {
  trainingFindMany.mockReset();
  trainingFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public homepage content", () => {
  it("provides complete, non-empty homepage copy for every supported locale", () => {
    for (const locale of publicLocales) {
      expect(homepageCopy(locale).every((copy) => copy.trim().length > 0)).toBe(true);
    }
  });

  it("does not fall back to French homepage copy in English or Portuguese", () => {
    const french = homepageCopy("fr");

    for (const locale of ["en", "pt"] as const) {
      const translated = homepageCopy(locale);

      expect(translated).toHaveLength(french.length);
      translated.forEach((copy, index) => {
        // The institution's name is the only copy shared across languages.
        if (copy !== "W'BAKENEL CONSULTING INSTITUTE") {
          expect(copy).not.toBe(french[index]);
        }
      });
    }
  });

  it("does not accept unsupported locale values", () => {
    expect(isPublicLocale("fr")).toBe(true);
    expect(isPublicLocale("de")).toBe(false);
    expect(isPublicLocale("FR")).toBe(false);
  });

  it("uses the approved WhatsApp contact destination", () => {
    expect(WHATSAPP_CONTACT_URL).toBe("https://wa.me/22651513197");
  });
});

describe("training-first positioning", () => {
  it("uses the approved French hero headline and supporting text", () => {
    expect(dictionaries.fr.home.heroTitle).toBe(
      "Former les compétences qui font avancer les organisations.",
    );
    expect(dictionaries.fr.home.heroDescription).toBe(
      "W'BAKENEL Consulting Institute propose des formations professionnelles en assurance, gestion de projet et statistique, avec une priorité accordée au secteur des assurances.",
    );
  });

  it.each([
    ["fr", /formation/i, ["assurance", "gestion de projet", "statistique"]],
    ["en", /training/i, ["insurance", "project management", "statistics"]],
    ["pt", /formação/i, ["seguros", "gestão de projetos", "estatística"]],
  ] as const)(
    "names professional training and all three domains in the %s hero",
    (locale, training, domains) => {
      const home = dictionaries[locale].home;

      expect(home.heroDescription).toMatch(training);
      for (const domain of domains) {
        expect(home.heroDescription.toLowerCase()).toContain(domain);
      }
    },
  );

  it.each(publicLocales)("leads the %s hero with training and offers contact second", (locale) => {
    const home = dictionaries[locale].home;
    const markup = readableText(
      renderToStaticMarkup(createElement(HomeHero, { locale, dictionary: home })),
    );

    expect(hrefs(markup)).toEqual([`/${locale}/formations`, WHATSAPP_CONTACT_URL]);
    expect(markup.indexOf(home.trainingCta)).toBeLessThan(markup.indexOf(home.heroContactCta));
  });

  it("uses the approved French call-to-action labels", () => {
    expect(dictionaries.fr.home.trainingCta).toBe("Découvrir nos formations");
    expect(dictionaries.fr.home.heroContactCta).toBe("Nous contacter");
  });

  it("describes the institute as a training provider in the shared footer descriptor", () => {
    expect(dictionaries.fr.descriptor).toMatch(/^Formation professionnelle/);
    expect(dictionaries.en.descriptor).toMatch(/^Professional training/);
    expect(dictionaries.pt.descriptor).toMatch(/^Formação profissional/);
  });
});

describe("confirmed training domains", () => {
  it("lists exactly the three confirmed domains with insurance first and as the priority", () => {
    expect(trainingDomainKeys).toEqual(["assurance", "gestionProjet", "statistique"]);
    expect(priorityTrainingDomain).toBe("assurance");
  });

  it.each([
    ["fr", ["Assurance", "Gestion de projet", "Statistique"], "Nos domaines de formation"],
    ["en", ["Insurance", "Project management", "Statistics"], "Our training domains"],
    ["pt", ["Seguros", "Gestão de projetos", "Estatística"], "Os nossos domínios de formação"],
  ] as const)("names the three domains in %s", (locale, names, title) => {
    const domains = dictionaries[locale].trainingDomains;

    expect(trainingDomainKeys.map((key) => domains.items[key].name)).toEqual(names);
    expect(domains.title).toBe(title);
  });

  it.each(publicLocales)("states the insurance priority in %s", (locale) => {
    const domains = dictionaries[locale].trainingDomains;

    expect(domains.description).toMatch(/assurances|insurance|segurador/);
    expect(domains.items.assurance.description).toMatch(/principal|principale/);
  });

  it.each(publicLocales)(
    "renders insurance first, marked as priority, and links to the %s training service",
    (locale) => {
      const dictionary = dictionaries[locale];
      const markup = readableText(
        renderToStaticMarkup(
          createElement(HomeTrainingDomains, {
            locale,
            dictionary: dictionary.home,
            domains: dictionary.trainingDomains,
          }),
        ),
      );
      const positions = trainingDomainKeys.map((key) =>
        markup.indexOf(dictionary.trainingDomains.items[key].name),
      );

      expect(markup).toContain(`id="${HOME_TRAINING_SECTION_ID}"`);
      expect(positions.every((position) => position > -1)).toBe(true);
      expect(positions).toEqual([...positions].sort((first, second) => first - second));
      expect(markup.indexOf(dictionary.trainingDomains.priorityLabel)).toBeLessThan(positions[1]);
      expect(markup.split(dictionary.trainingDomains.priorityLabel)).toHaveLength(2);
      expect(hrefs(markup)).toEqual([serviceHref(locale, "formation")]);
    },
  );
});

describe("homepage section hierarchy", () => {
  it.each(publicLocales)("orders the %s homepage training first", async (locale) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dictionary = dictionaries[locale];
    const markup = await renderHomepage(locale);
    const sectionHeadings = [
      dictionary.home.heroTitle,
      dictionary.trainingDomains.title,
      dictionary.home.trainingTitle,
      dictionary.home.introductionTitle,
      dictionary.home.complementaryTitle,
      dictionary.home.contactTitle,
    ].map((heading) => markup.indexOf(heading));

    expect(sectionHeadings.every((position) => position > -1)).toBe(true);
    expect(sectionHeadings).toEqual([...sectionHeadings].sort((first, second) => first - second));
  });

  it("calls notFound for an unsupported locale", async () => {
    await expect(renderHomepage("de")).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });
});

describe("homepage training preview reader", () => {
  it("delegates to the canonical public training reader with a bounded limit", async () => {
    const reader = {
      listPublicTrainings: vi.fn().mockResolvedValue([publishedTraining]),
    };

    await expect(getHomepageTrainingPreview("fr", reader)).resolves.toEqual({
      status: "available",
      trainings: [publishedTraining],
    });
    expect(reader.listPublicTrainings).toHaveBeenCalledWith("fr", {
      limit: HOMEPAGE_TRAINING_LIMIT,
    });
  });

  it("reports an empty state when no eligible published training exists", async () => {
    const reader = {
      listPublicTrainings: vi.fn().mockResolvedValue([]),
    };

    await expect(getHomepageTrainingPreview("pt", reader)).resolves.toEqual({ status: "empty" });
  });

  it.each([
    ["an unreachable database", unreachableDatabaseError()],
    [
      "an unclassified database response",
      new Prisma.PrismaClientUnknownRequestError("postgres://admin:secret@db.internal failed", {
        clientVersion: CLIENT_VERSION,
      }),
    ],
    [
      "a failed client initialization",
      new Prisma.PrismaClientInitializationError(
        "Invalid URL postgres://admin:secret@db.internal",
        CLIENT_VERSION,
      ),
    ],
  ])("reports %s as unavailable without logging connection details", async (_, error) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getHomepageTrainingPreview("en", failingReader(error))).resolves.toEqual({
      status: "unavailable",
    });
    expect(consoleError).toHaveBeenCalledTimes(1);

    const logLine = consoleError.mock.calls[0].join(" ");

    expect(logLine).toContain(error.name);
    expect(logLine).not.toMatch(CONNECTION_DETAILS);
  });

  it("logs the Prisma error code for an operational request failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await getHomepageTrainingPreview("fr", failingReader(unreachableDatabaseError()));

    expect(consoleError.mock.calls[0].join(" ")).toContain("P1001");
  });

  it.each([
    [
      "an invalid query",
      new Prisma.PrismaClientValidationError("Unknown argument", { clientVersion: CLIENT_VERSION }),
    ],
    ["a programming error", new TypeError("Cannot read properties of undefined")],
    ["a non-error rejection", "unexpected"],
  ])("does not disguise %s as a temporary outage", async (_, error) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getHomepageTrainingPreview("fr", failingReader(error))).rejects.toBe(error);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("homepage training preview states", () => {
  it.each(publicLocales)("lists published training in %s", (locale) => {
    const markup = renderPreview(locale, {
      status: "available",
      trainings: [
        publishedTraining,
        { slug: "sans-resume", title: "Sans résumé", summary: null, ...publishedTaxonomy },
      ],
    });
    const home = dictionaries[locale].home;

    expect(markup).toContain(publishedTraining.title);
    expect(markup).toContain(publishedTraining.summary);
    expect(markup).toContain(home.trainingNoSummary);
    expect(markup).not.toContain(home.trainingEmpty);
    expect(markup).not.toContain(home.trainingUnavailable);
  });

  it.each(publicLocales)("shows an honest empty state in %s without invented records", (locale) => {
    const markup = renderPreview(locale, { status: "empty" });
    const home = dictionaries[locale].home;

    expect(markup).toContain(home.trainingEmpty);
    expect(markup).not.toContain(home.trainingUnavailable);
    expect(markup).not.toContain("<li");
  });

  it.each(publicLocales)("shows a distinct temporary-unavailability state in %s", (locale) => {
    const markup = renderPreview(locale, { status: "unavailable" });
    const home = dictionaries[locale].home;

    expect(home.trainingUnavailable).not.toBe(home.trainingEmpty);
    expect(markup).toContain(home.trainingUnavailable);
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain(home.trainingEmpty);
    expect(markup).not.toContain("<li");
  });

  it("keeps the whole homepage rendering when the database is unreachable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    trainingFindMany.mockRejectedValue(unreachableDatabaseError());
    const dictionary = dictionaries.fr;
    const markup = await renderHomepage("fr");

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(markup).toContain(dictionary.home.trainingUnavailable);
    expect(markup).toContain(dictionary.trainingDomains.items.assurance.name);
    expect(markup).toContain(dictionary.home.contactTitle);
  });

  it("lets an unexpected error fail the page instead of showing the outage message", async () => {
    trainingFindMany.mockRejectedValue(new TypeError("Cannot read properties of undefined"));

    await expect(renderHomepage("fr")).rejects.toThrow(TypeError);
  });
});

describe("homepage training query", () => {
  it.each(publicLocales)(
    "queries only eligible %s training through the canonical reader, bounded to the preview size",
    async (locale) => {
      await renderHomepage(locale);

      expect(trainingFindMany).toHaveBeenCalledTimes(1);
      expect(trainingFindMany.mock.calls[0][0]).toMatchObject({
        where: publicTrainingWhere(locale),
        take: HOMEPAGE_TRAINING_LIMIT,
      });
    },
  );
});

describe("homepage institutional claims", () => {
  it.each(publicLocales)("makes no unsupported programme or credential claims in %s", (locale) => {
    const unsupportedClaims = [
      /certifi|certific|accr[ée]dit|accredit|acredit|diplôm|diplom|agréé|homologad/i,
      /agile|scrum|pmp|prince2|pmi\b/i,
      /excel|spss|stata|python|\bsas\b|\bR\b/,
      /\d+\s?%/,
      /garanti|guarantee|garant/i,
      /\bleader\b|\blíder\b|n°\s?1|number one/i,
      /FCFA|XOF|€|\$|\bprix\b|\bprice|\bpreço/i,
      /\b\d+\s?(heures|hours|horas|jours|days|dias|semaines|weeks|semanas|mois|months|meses)\b/i,
    ];

    for (const copy of homepageCopy(locale)) {
      for (const claim of unsupportedClaims) {
        expect(copy).not.toMatch(claim);
      }
    }
  });
});
