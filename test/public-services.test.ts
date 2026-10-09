import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { HomeComplementaryServices } from "../app/(public)/[locale]/_components/home-complementary-services";
import * as serviceDetailRoute from "../app/(public)/[locale]/services/[service]/page";
import * as servicesOverviewRoute from "../app/(public)/[locale]/services/page";
import { dictionaries } from "../lib/public/content";
import {
  localizedPathname,
  localizedPublicHref,
  publicLocales,
  type PublicLocale,
} from "../lib/public/locale";
import {
  complementaryServiceSlugs,
  getServiceContent,
  isServiceSlug,
  primaryServiceSlug,
  serviceDetailMetadata,
  serviceHref,
  serviceImages,
  serviceSlugs,
  servicesHref,
  servicesOverviewMetadata,
} from "../lib/public/services";

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

function allServiceCopy(locale: PublicLocale) {
  return allStrings(dictionaries[locale].services);
}

function detailParams(locale: string, service: string) {
  return { params: Promise.resolve({ locale, service }) };
}

async function renderServicesOverview(locale: PublicLocale) {
  return readableText(
    renderToStaticMarkup(
      await servicesOverviewRoute.default({ params: Promise.resolve({ locale }) }),
    ),
  );
}

async function renderServiceDetail(locale: PublicLocale, service: string) {
  return readableText(
    renderToStaticMarkup(await serviceDetailRoute.default(detailParams(locale, service))),
  );
}

/** React escapes apostrophes and ampersands; decode them so copy can be compared verbatim. */
function readableText(markup: string) {
  return markup.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

function hrefs(markup: string) {
  return [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

describe("service slug allowlist", () => {
  it("accepts exactly the four implemented service slugs", () => {
    expect(serviceSlugs).toEqual(["conseil", "formation", "audits", "iso"]);

    for (const slug of serviceSlugs) {
      expect(isServiceSlug(slug)).toBe(true);
    }
  });

  it.each(["", "Conseil", "ISO", "conseil/", "../admin", "consulting", "__proto__", "constructor"])(
    "rejects the unknown or malformed slug %j",
    (slug) => {
      expect(isServiceSlug(slug)).toBe(false);
    },
  );

  it("statically generates only the allowlisted slugs and 404s every other segment", () => {
    expect(serviceDetailRoute.dynamicParams).toBe(false);
    expect(serviceDetailRoute.generateStaticParams()).toEqual(
      serviceSlugs.map((service) => ({ service })),
    );
  });

  it("calls notFound for an unknown slug even if the route is reached", async () => {
    await expect(serviceDetailRoute.default(detailParams("fr", "unknown"))).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });

  it("calls notFound for an unsupported locale on both service routes", async () => {
    await expect(serviceDetailRoute.default(detailParams("de", "iso"))).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    await expect(
      servicesOverviewRoute.default({ params: Promise.resolve({ locale: "de" }) }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("returns empty metadata instead of indexing content with unvalidated params", async () => {
    await expect(
      serviceDetailRoute.generateMetadata(detailParams("fr", "__proto__")),
    ).resolves.toEqual({});
    await expect(serviceDetailRoute.generateMetadata(detailParams("xx", "iso"))).resolves.toEqual(
      {},
    );
  });

  it("uses only the reviewed static images", () => {
    expect(Object.values(serviceImages).map((image) => image.src)).toEqual([
      "/images/consulting.png",
      "/images/training.png",
      "/images/audit.png",
      "/images/iso.png",
    ]);
  });
});

describe("service navigation URLs", () => {
  it("builds overview and detail paths with the shared French segments", () => {
    expect(publicLocales.map(servicesHref)).toEqual([
      "/fr/services",
      "/en/services",
      "/pt/services",
    ]);
    expect(serviceHref("pt", "iso")).toBe("/pt/services/iso");
    expect(serviceHref("en", "audits")).toBe("/en/services/audits");
  });

  it("switches locale while keeping the current page", () => {
    expect(localizedPathname("/fr/services/iso", "en")).toBe("/en/services/iso");
    expect(localizedPathname("/en/services", "pt")).toBe("/pt/services");
    expect(localizedPathname("/pt", "fr")).toBe("/fr");
    expect(localizedPathname("/fr/", "en")).toBe("/en");
  });

  it("preserves the current route query and section when switching languages", () => {
    expect(localizedPublicHref("/fr/services", "pt", "view=all", "#overview")).toBe(
      "/pt/services?view=all#overview",
    );
    expect(localizedPublicHref("/en", "fr", "", "#formations-publiees")).toBe(
      "/fr#formations-publiees",
    );
  });

  it("falls back to the target homepage outside the public locale tree", () => {
    expect(localizedPathname("/admin/login", "en")).toBe("/en");
    expect(localizedPathname("/", "pt")).toBe("/pt");
    expect(localizedPathname("/de/services", "fr")).toBe("/fr");
  });

  it("treats training as the primary service and keeps the other three complementary", () => {
    expect(primaryServiceSlug).toBe("formation");
    expect(complementaryServiceSlugs).toEqual(["conseil", "audits", "iso"]);
  });
});

describe("service dictionaries", () => {
  it("provides complete, non-empty services copy for every locale", () => {
    for (const locale of publicLocales) {
      const services = dictionaries[locale].services;

      expect(Object.keys(services.items).sort()).toEqual([...serviceSlugs].sort());
      expect(dictionaries[locale].servicesNav.trim()).not.toBe("");
      expect(dictionaries[locale].homeNav.trim()).not.toBe("");
      expect(dictionaries[locale].trainingsNav.trim()).not.toBe("");
      expect(dictionaries[locale].aboutNav.trim()).not.toBe("");
      expect(dictionaries[locale].languageSelector.trim()).not.toBe("");
      expect(allServiceCopy(locale).every((copy) => copy.trim().length > 0)).toBe(true);
    }
  });

  it("keeps the same structure in every locale", () => {
    for (const slug of serviceSlugs) {
      const french = dictionaries.fr.services.items[slug];

      for (const locale of ["en", "pt"] as const) {
        const translated = dictionaries[locale].services.items[slug];

        expect(translated.explanation).toHaveLength(french.explanation.length);
        expect(translated.needs).toHaveLength(french.needs.length);
        expect(translated.areas).toHaveLength(french.areas.length);
        expect(translated.approach).toHaveLength(french.approach.length);
      }
    }
  });

  it("does not fall back to French copy in English or Portuguese", () => {
    const french = allServiceCopy("fr");

    for (const locale of ["en", "pt"] as const) {
      const translated = allServiceCopy(locale);

      expect(translated).toHaveLength(french.length);
      translated.forEach((copy, index) => {
        expect(copy).not.toBe(french[index]);
      });
    }
  });
});

describe("service metadata", () => {
  it("localizes the overview title and description", async () => {
    const titles = new Set<unknown>();

    for (const locale of publicLocales) {
      const metadata = await servicesOverviewRoute.generateMetadata({
        params: Promise.resolve({ locale }),
      });
      const overview = dictionaries[locale].services.overview;

      expect(metadata).toEqual(servicesOverviewMetadata(dictionaries[locale]));
      expect(metadata.title).toBe(`${overview.metaTitle} | W'BAKENEL Consulting Institute`);
      expect(metadata.description).toBe(overview.metaDescription);
      titles.add(metadata.title);
    }

    expect(titles.size).toBe(3);
  });

  it("localizes every service detail title and description", async () => {
    for (const slug of serviceSlugs) {
      const descriptions = new Set<unknown>();

      for (const locale of publicLocales) {
        const service = getServiceContent(dictionaries[locale], slug);
        const metadata = await serviceDetailRoute.generateMetadata(detailParams(locale, slug));

        expect(metadata).toEqual(serviceDetailMetadata(dictionaries[locale], slug));
        expect(metadata.title).toBe(`${service.name} | W'BAKENEL Consulting Institute`);
        expect(metadata.description).toBe(service.metaDescription);
        descriptions.add(metadata.description);
      }

      expect(descriptions.size).toBe(3);
    }
  });
});

describe("institutional claims", () => {
  it("states in every locale that W'BAKENEL does not issue ISO certificates", () => {
    expect(dictionaries.fr.services.items.iso.notice).toContain(
      "W'BAKENEL ne délivre pas de certificats ISO",
    );
    expect(dictionaries.en.services.items.iso.notice).toContain(
      "W'BAKENEL does not issue ISO certificates",
    );
    expect(dictionaries.pt.services.items.iso.notice).toContain(
      "A W'BAKENEL não emite certificados ISO",
    );

    for (const locale of publicLocales) {
      const iso = dictionaries[locale].services.items.iso;

      expect(iso.notice).toMatch(/indépendants|independent|independentes/);
      expect(iso.metaDescription).toMatch(/ne délivre pas|does not issue|não emite/);
    }
  });

  it("does not present studies and audits as statutory audit authority", () => {
    expect(dictionaries.fr.services.items.audits.notice).toContain("ne se substituent pas");
    expect(dictionaries.en.services.items.audits.notice).toContain("do not replace");
    expect(dictionaries.pt.services.items.audits.notice).toContain("Não substituem");
  });

  it("mentions accreditation only to deny it", () => {
    for (const locale of publicLocales) {
      const accreditationCopy = allServiceCopy(locale).filter((copy) =>
        /accr[ée]dit|accredit|acredit/i.test(copy),
      );

      expect(accreditationCopy).toHaveLength(1);
      expect(accreditationCopy[0]).toMatch(/ne sont pas|are not|não são/);
    }
  });

  it.each(publicLocales)("makes no unsupported promises or claims in %s", (locale) => {
    const unsupportedClaims = [
      /\d+\s?%/,
      /garanti|guarantee|garant/i,
      /taux de réussite|success rate|taxa de sucesso/i,
      /\bleader\b|\blíder\b|n°\s?1|number one/i,
      /agréé|government-approved|homologad/i,
      /FCFA|XOF|€|\$|\bprix\b|\bprice|\bpreço/i,
      /\b\d+\s?(jours|days|dias|semaines|weeks|semanas|mois|months|meses)\b/i,
    ];

    for (const copy of allServiceCopy(locale)) {
      for (const claim of unsupportedClaims) {
        expect(copy).not.toMatch(claim);
      }
    }
  });

  it.each(publicLocales)("exposes no private contact or internal data in %s", (locale) => {
    for (const copy of allServiceCopy(locale)) {
      expect(copy).not.toMatch(/@|https?:\/\/|\+\d{3}|\b\d{8,}\b/);
      expect(copy).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
  });
});

describe("homepage complementary services", () => {
  it.each(publicLocales)(
    "links each %s complementary service card to its implemented service page",
    (locale) => {
      const dictionary = dictionaries[locale];
      const markup = readableText(
        renderToStaticMarkup(createElement(HomeComplementaryServices, { locale, dictionary })),
      );

      expect(hrefs(markup)).toEqual([
        ...complementaryServiceSlugs.map((slug) => serviceHref(locale, slug)),
        servicesHref(locale),
      ]);
      for (const slug of complementaryServiceSlugs) {
        expect(markup).toContain(getServiceContent(dictionary, slug).name);
      }
      expect(markup).toContain(dictionary.home.complementaryOverviewCta);
    },
  );
});

describe("training-first services pages", () => {
  it.each([
    ["fr", /formation professionnelle/i],
    ["en", /professional training/i],
    ["pt", /formação profissional/i],
  ] as const)("presents training as the core activity in the %s overview", (locale, training) => {
    const overview = dictionaries[locale].services.overview;

    expect(overview.title).toMatch(training);
    expect(overview.description).toMatch(/assurances|insurance|segurador/);
  });

  it.each(publicLocales)(
    "features training and its three domains before complementary services in %s",
    async (locale) => {
      const dictionary = dictionaries[locale];
      const overview = dictionary.services.overview;
      const markup = await renderServicesOverview(locale);
      const trainingPosition = markup.indexOf(overview.primaryEyebrow);
      const complementaryPosition = markup.indexOf(overview.complementaryTitle);

      expect(trainingPosition).toBeGreaterThan(-1);
      expect(trainingPosition).toBeLessThan(complementaryPosition);
      for (const domain of Object.values(dictionary.trainingDomains.items)) {
        expect(markup.indexOf(domain.name)).toBeGreaterThan(trainingPosition);
        expect(markup.indexOf(domain.name)).toBeLessThan(complementaryPosition);
      }
      expect(hrefs(markup)).toEqual(
        expect.arrayContaining(serviceSlugs.map((slug) => serviceHref(locale, slug))),
      );
    },
  );

  it.each(publicLocales)(
    "shows the three training domains on the %s formation page",
    async (locale) => {
      const domains = dictionaries[locale].trainingDomains;
      const markup = await renderServiceDetail(locale, "formation");

      expect(markup).toContain(domains.title);
      expect(markup).toContain(domains.priorityLabel);
      for (const domain of Object.values(domains.items)) {
        expect(markup).toContain(domain.name);
      }
      expect(markup).toContain(dictionaries[locale].services.items.formation.notice);
    },
  );

  it.each(publicLocales)(
    "keeps complementary %s service pages focused on their own service",
    async (locale) => {
      const dictionary = dictionaries[locale];

      for (const slug of complementaryServiceSlugs) {
        const markup = await renderServiceDetail(locale, slug);

        expect(markup).not.toContain(dictionary.trainingDomains.title);
        expect(markup).toContain(getServiceContent(dictionary, slug).notice);
      }
    },
  );
});
