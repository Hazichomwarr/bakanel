import { DeliveryMode, PricingMode, Prisma } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublicTrainingBySlug = vi.hoisted(() => vi.fn());
const listPublicTrainingAlternates = vi.hoisted(() => vi.fn());
const listPublicUpcomingSessionsForTraining = vi.hoisted(() => vi.fn());

vi.mock("@/lib/public/training.read", () => ({
  publicTrainingReader: { getPublicTrainingBySlug, listPublicTrainingAlternates },
}));

vi.mock("@/lib/public/session.read", () => ({
  publicSessionReader: { listPublicUpcomingSessionsForTraining },
}));

import TrainingDetailPage, {
  generateMetadata,
} from "../app/(public)/[locale]/formations/[slug]/page";
import { WHATSAPP_CONTACT_URL } from "../lib/public/contact";
import { dictionaries } from "../lib/public/content";
import { publicLocales } from "../lib/public/locale";
import {
  formatPublicDate,
  formatPublicDateRange,
  formatPublicSessionDelivery,
  formatPublicSessionPrice,
} from "../lib/public/training-presentation";

const training = {
  slug: "gestion-des-sinistres",
  title: "Gestion des sinistres",
  summary: "Une formation publiée.",
  description: "Comprendre les dossiers de sinistres.",
  objectives: "Identifier les étapes clés.",
  targetAudience: "Professionnels de l'assurance.",
  program: "Étude des déclarations et du règlement.",
  domain: { name: "Assurance", slug: "assurance" },
  topic: { name: "Sinistres", slug: "sinistres" },
};

const openSession = {
  trainingSlug: training.slug,
  trainingTitle: training.title,
  startDate: new Date("2026-11-02T00:00:00.000Z"),
  endDate: new Date("2026-11-03T00:00:00.000Z"),
  deliveryMode: DeliveryMode.IN_PERSON,
  city: "Ouagadougou",
  country: "BF",
  venue: "Centre de formation",
  pricingMode: PricingMode.FIXED,
  price: "150000",
  currency: "XOF",
  registrationDeadline: new Date("2026-10-30T00:00:00.000Z"),
  registrationOpen: true,
};

function routeProps(locale: string, slug: string) {
  return { params: Promise.resolve({ locale, slug }) };
}

function readableText(markup: string) {
  return markup.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

async function renderDetail(locale = "fr", slug = training.slug) {
  const page = await TrainingDetailPage(routeProps(locale, slug));
  return readableText(renderToStaticMarkup(page));
}

function unreachableDatabaseError() {
  return new Prisma.PrismaClientKnownRequestError(
    "Can't reach database server at postgres://admin:secret@db.internal:5432",
    { code: "P1001", clientVersion: "test" },
  );
}

beforeEach(() => {
  getPublicTrainingBySlug.mockReset();
  listPublicTrainingAlternates.mockReset();
  listPublicUpcomingSessionsForTraining.mockReset();
  getPublicTrainingBySlug.mockResolvedValue(training);
  listPublicTrainingAlternates.mockResolvedValue([]);
  listPublicUpcomingSessionsForTraining.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public programme detail route", () => {
  it("renders only the eligible training DTO and delegates sessions using its localized slug", async () => {
    listPublicUpcomingSessionsForTraining.mockResolvedValue([openSession]);

    const markup = await renderDetail();

    expect(getPublicTrainingBySlug).toHaveBeenCalledWith("fr", training.slug);
    expect(listPublicUpcomingSessionsForTraining).toHaveBeenCalledWith("fr", training.slug);
    expect(markup).toContain(training.title);
    expect(markup).toContain(training.domain.name);
    expect(markup).toContain(training.topic.name);
    expect(markup).toContain(training.description);
    expect(markup).toContain(training.objectives);
    expect(markup).toContain(training.targetAudience);
    expect(markup).toContain(training.program);
    expect(markup).not.toContain("internal-training-id");
    expect(markup).not.toContain("DRAFT");
  });

  it("uses reader-provided alternate slugs and falls back to each catalogue without guessing", async () => {
    listPublicTrainingAlternates.mockResolvedValue([{ locale: "en", slug: "claims-management" }]);

    const markup = await renderDetail();

    expect(listPublicTrainingAlternates).toHaveBeenCalledWith("fr", training.slug);
    expect(markup).toContain(
      'data-public-training-locale-targets="{&quot;fr&quot;:&quot;/fr/formations/gestion-des-sinistres&quot;,&quot;en&quot;:&quot;/en/formations/claims-management&quot;,&quot;pt&quot;:&quot;/pt/formations&quot;}"',
    );
    expect(markup).not.toContain("/pt/formations/gestion-des-sinistres");
  });

  it("omits empty optional programme sections without inventing content", async () => {
    getPublicTrainingBySlug.mockResolvedValue({
      ...training,
      summary: null,
      description: null,
      objectives: null,
      targetAudience: null,
      program: null,
    });

    const markup = await renderDetail();

    expect(markup).not.toContain(dictionaries.fr.trainingDetail.descriptionLabel);
    expect(markup).not.toContain(dictionaries.fr.trainingDetail.objectivesLabel);
    expect(markup).not.toContain(dictionaries.fr.trainingDetail.audienceLabel);
    expect(markup).not.toContain(dictionaries.fr.trainingDetail.programmeContentLabel);
  });

  it("renders OPEN and registration-closed upcoming sessions without implying enrolment", async () => {
    listPublicUpcomingSessionsForTraining.mockResolvedValue([
      openSession,
      {
        ...openSession,
        startDate: new Date("2026-12-01T00:00:00.000Z"),
        endDate: new Date("2026-12-01T00:00:00.000Z"),
        registrationOpen: false,
        deliveryMode: DeliveryMode.ONLINE,
        city: "Stale city",
        venue: "Stale venue",
        country: "BF",
        pricingMode: PricingMode.ON_REQUEST,
        price: null,
        currency: null,
      },
    ]);

    const markup = await renderDetail();

    expect(markup).toContain(dictionaries.fr.trainingDetail.registrationOpen);
    expect(markup).toContain(dictionaries.fr.trainingDetail.registrationClosed);
    expect(markup).toContain(dictionaries.fr.trainingDetail.onlineLabel);
    expect(markup).toContain(dictionaries.fr.trainingDetail.onRequestLabel);
    expect(markup).toContain("150");
    expect(markup).toContain("CFA");
    expect(markup).not.toContain("Stale city");
    expect(markup).not.toMatch(/s'inscrire|inscription/i);
    expect(markup).toContain(`href="${WHATSAPP_CONTACT_URL}"`);
  });

  it("keeps a programme page useful when no upcoming public sessions exist", async () => {
    const markup = await renderDetail("pt");

    expect(markup).toContain(dictionaries.pt.trainingDetail.sessionsEmpty);
  });

  it("returns a genuine 404 when the canonical reader cannot find the localized programme", async () => {
    getPublicTrainingBySlug.mockResolvedValue(null);

    await expect(renderDetail("en", "wrong-locale-slug")).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    expect(listPublicUpcomingSessionsForTraining).not.toHaveBeenCalled();
  });

  it("renders an unavailable state rather than treating database failure as a 404", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getPublicTrainingBySlug.mockRejectedValue(unreachableDatabaseError());

    const markup = await renderDetail();

    expect(markup).toContain(dictionaries.fr.trainingDetail.unavailableTitle);
    expect(consoleError).toHaveBeenCalledWith(
      "Public training detail unavailable (PrismaClientKnownRequestError:P1001).",
    );
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringMatching(/secret|postgres|db\.internal/),
    );
  });

  it("uses only eligible alternate slugs in localized metadata", async () => {
    listPublicTrainingAlternates.mockResolvedValue([
      { locale: "fr", slug: "gestion-des-sinistres" },
      { locale: "pt", slug: "gestao-de-sinistros" },
    ]);

    const metadata = await generateMetadata(routeProps("en", training.slug));

    expect(metadata).toEqual({
      title: `${training.title} | W'BAKENEL Consulting Institute`,
      description: training.summary,
      alternates: {
        canonical: `/en/formations/${training.slug}`,
        languages: {
          en: `/en/formations/${training.slug}`,
          fr: "/fr/formations/gestion-des-sinistres",
          pt: "/pt/formations/gestao-de-sinistros",
        },
      },
    });
  });

  it("does not advertise an unavailable translation in metadata", async () => {
    listPublicTrainingAlternates.mockResolvedValue([{ locale: "fr", slug: training.slug }]);

    const metadata = await generateMetadata(routeProps("en", training.slug));

    expect(metadata.alternates).toEqual({
      canonical: `/en/formations/${training.slug}`,
      languages: {
        en: `/en/formations/${training.slug}`,
        fr: `/fr/formations/${training.slug}`,
      },
    });
    expect(metadata).not.toMatchObject({
      alternates: { languages: { pt: expect.any(String) } },
    });
  });
});

describe("public session presentation", () => {
  const copy = dictionaries.fr.trainingDetail;

  it("does not imply an independent session-publication state in any locale", () => {
    for (const locale of publicLocales) {
      const detail = dictionaries[locale].trainingDetail;

      expect(detail.sessionsDescription).not.toMatch(/publiée|published|publicadas/i);
      expect(detail.sessionsEmpty).not.toMatch(/publiée|published|publicadas/i);
    }
  });

  it("formats date-only values in UTC without a timezone day shift", () => {
    const startDate = new Date("2026-11-02T00:00:00.000Z");
    const endDate = new Date("2026-11-03T00:00:00.000Z");

    expect(formatPublicDate("fr", startDate)).toContain("2");
    expect(formatPublicDateRange("fr", startDate, endDate)).toContain("—");
  });

  it("formats fixed XOF prices as CFA and keeps on-request prices free of fake amounts", () => {
    expect(formatPublicSessionPrice("fr", openSession, copy)).toMatch(/150[\s\u202f]?000 CFA/);
    expect(
      formatPublicSessionPrice(
        "fr",
        { ...openSession, pricingMode: PricingMode.ON_REQUEST, price: null, currency: null },
        copy,
      ),
    ).toBe(copy.onRequestLabel);
  });

  it("shows online sessions without their stale physical location", () => {
    expect(
      formatPublicSessionDelivery(
        { ...openSession, deliveryMode: DeliveryMode.ONLINE, city: "Stale city" },
        copy,
      ),
    ).toEqual({ delivery: copy.onlineLabel, location: copy.onlineLabel });
  });
});
