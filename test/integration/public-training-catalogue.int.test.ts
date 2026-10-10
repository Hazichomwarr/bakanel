import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getHomepageTrainingPreview, HOMEPAGE_TRAINING_LIMIT } from "@/lib/public/homepage";
import type { PublicLocale } from "@/lib/public/locale";
import { createPublicTrainingReader } from "@/lib/public/training.read";

import { createDomain, createTopic, createTraining, resetPublicContent } from "./support/fixtures";
import { createTestPrismaClient } from "./support/test-prisma";

let client: PrismaClient;
let reader: ReturnType<typeof createPublicTrainingReader>;

beforeAll(() => {
  client = createTestPrismaClient();
  reader = createPublicTrainingReader(client);
});

beforeEach(async () => {
  await resetPublicContent(client);
});

afterAll(async () => {
  await client.$disconnect();
});

/** A published domain and topic, each published in the given locales unless overridden. */
async function createPublishedTaxonomy(
  name: string,
  options: {
    domainDisplayOrder?: number;
    topicDisplayOrder?: number;
    domainStatus?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    publishedLocales?: Array<"FR" | "EN" | "PT">;
    unpublishedTopicLocales?: Array<"FR" | "EN" | "PT">;
    unpublishedDomainLocales?: Array<"FR" | "EN" | "PT">;
  } = {},
) {
  const locales = options.publishedLocales ?? ["FR"];
  const domain = await createDomain(client, {
    status: options.domainStatus,
    displayOrder: options.domainDisplayOrder,
    translations: locales.map((locale) => ({
      locale,
      slug: `${name}-domain-${locale.toLowerCase()}`,
      isPublished: !options.unpublishedDomainLocales?.includes(locale),
    })),
  });
  const topic = await createTopic(client, {
    trainingDomainId: domain.id,
    displayOrder: options.topicDisplayOrder,
    translations: locales.map((locale) => ({
      locale,
      slug: `${name}-topic-${locale.toLowerCase()}`,
      isPublished: !options.unpublishedTopicLocales?.includes(locale),
    })),
  });

  return { domain, topic };
}

describe("public programme detail against PostgreSQL", () => {
  it("returns every modeled section with the requested locale's taxonomy labels", async () => {
    const { topic } = await createPublishedTaxonomy("claims", { publishedLocales: ["FR", "EN"] });
    await createTraining(client, {
      trainingTopicId: topic.id,
      translations: [
        {
          locale: "FR",
          slug: "sinistres",
          objectives: "it-objectifs",
          targetAudience: "it-public",
          program: "it-programme",
        },
        { locale: "EN", slug: "claims" },
      ],
    });

    const detail = await reader.getPublicTrainingBySlug("fr", "it-sinistres");

    expect(detail).toEqual({
      slug: "it-sinistres",
      title: "it-sinistres title",
      summary: "it-sinistres summary",
      description: "it-sinistres description",
      objectives: "it-objectifs",
      targetAudience: "it-public",
      program: "it-programme",
      domain: { name: "it-claims-domain-fr", slug: "it-claims-domain-fr" },
      topic: { name: "it-claims-topic-fr", slug: "it-claims-topic-fr" },
    });
    expect(JSON.stringify(detail)).not.toMatch(/"id"|isPublished|status|createdAt|updatedAt/);
  });

  it("represents missing optional content as null without borrowing another locale", async () => {
    const { topic } = await createPublishedTaxonomy("sparse", { publishedLocales: ["FR", "EN"] });
    await createTraining(client, {
      trainingTopicId: topic.id,
      translations: [
        { locale: "FR", slug: "sparse-fr", objectives: "it-objectifs-fr" },
        { locale: "EN", slug: "sparse-en", summary: null, description: "   " },
      ],
    });

    await expect(reader.getPublicTrainingBySlug("en", "it-sparse-en")).resolves.toMatchObject({
      summary: null,
      description: null,
      objectives: null,
      targetAudience: null,
      program: null,
    });
  });

  it("hides DRAFT and ARCHIVED programmes from lists, detail, and alternates", async () => {
    const { topic } = await createPublishedTaxonomy("lifecycle", {
      publishedLocales: ["FR", "EN"],
    });
    for (const status of ["DRAFT", "ARCHIVED"] as const) {
      await createTraining(client, {
        trainingTopicId: topic.id,
        status,
        translations: [
          { locale: "FR", slug: `${status.toLowerCase()}-fr` },
          { locale: "EN", slug: `${status.toLowerCase()}-en` },
        ],
      });
    }

    await expect(reader.listPublicTrainings("fr")).resolves.toEqual([]);
    await expect(reader.getPublicTrainingBySlug("fr", "it-draft-fr")).resolves.toBeNull();
    await expect(reader.getPublicTrainingBySlug("fr", "it-archived-fr")).resolves.toBeNull();
    await expect(reader.listPublicTrainingAlternates("fr", "it-archived-fr")).resolves.toEqual([]);
    await expect(client.training.count({ where: { status: "ARCHIVED" } })).resolves.toBe(1);
  });

  it("hides a programme whose requested-locale topic or domain label is unpublished", async () => {
    const hiddenTopic = await createPublishedTaxonomy("topic-label", {
      publishedLocales: ["FR", "EN"],
      unpublishedTopicLocales: ["EN"],
    });
    const hiddenDomain = await createPublishedTaxonomy("domain-label", {
      publishedLocales: ["FR", "EN"],
      unpublishedDomainLocales: ["EN"],
    });
    await createTraining(client, {
      trainingTopicId: hiddenTopic.topic.id,
      translations: [
        { locale: "FR", slug: "topic-label-fr" },
        { locale: "EN", slug: "topic-label-en" },
      ],
    });
    await createTraining(client, {
      trainingTopicId: hiddenDomain.topic.id,
      translations: [
        { locale: "FR", slug: "domain-label-fr" },
        { locale: "EN", slug: "domain-label-en" },
      ],
    });

    await expect(reader.listPublicTrainings("en")).resolves.toEqual([]);
    await expect(reader.getPublicTrainingBySlug("en", "it-topic-label-en")).resolves.toBeNull();
    await expect(reader.getPublicTrainingBySlug("en", "it-domain-label-en")).resolves.toBeNull();
    await expect(reader.listPublicTrainings("fr")).resolves.toHaveLength(2);
  });

  it("hides a programme under an ARCHIVED domain", async () => {
    const { topic } = await createPublishedTaxonomy("archived-domain", {
      domainStatus: "ARCHIVED",
    });
    await createTraining(client, {
      trainingTopicId: topic.id,
      translations: [{ locale: "FR", slug: "under-archived" }],
    });

    await expect(reader.listPublicTrainings("fr")).resolves.toEqual([]);
    await expect(reader.getPublicTrainingBySlug("fr", "it-under-archived")).resolves.toBeNull();
  });

  it("rejects an unsupported locale for detail and alternates", async () => {
    await expect(reader.getPublicTrainingBySlug("de" as PublicLocale, "x")).rejects.toThrow(
      "Unsupported public locale.",
    );
    await expect(reader.listPublicTrainingAlternates("de" as PublicLocale, "x")).rejects.toThrow(
      "Unsupported public locale.",
    );
  });
});

describe("public catalogue ordering against PostgreSQL", () => {
  it("orders by domain, then topic display order, then creation time, across pages", async () => {
    // Created out of order so insertion order cannot explain the result.
    const statistique = await createPublishedTaxonomy("statistique", { domainDisplayOrder: 30 });
    const assurance = await createPublishedTaxonomy("assurance", { domainDisplayOrder: 10 });
    const gestion = await createPublishedTaxonomy("gestion", { domainDisplayOrder: 20 });
    const assuranceSecondTopic = await createTopic(client, {
      trainingDomainId: assurance.domain.id,
      displayOrder: 5,
      translations: [{ locale: "FR", slug: "assurance-topic-2" }],
    });

    const earlier = new Date("2026-01-01T00:00:00.000Z");
    const later = new Date("2026-02-01T00:00:00.000Z");
    const create = (topicId: string, slug: string, createdAt: Date) =>
      createTraining(client, {
        trainingTopicId: topicId,
        createdAt,
        translations: [{ locale: "FR", slug }],
      });

    await create(statistique.topic.id, "stat", earlier);
    await create(assuranceSecondTopic.id, "assurance-second-topic", earlier);
    await create(gestion.topic.id, "gestion", earlier);
    await create(assurance.topic.id, "assurance-later", later);
    await create(assurance.topic.id, "assurance-earlier", earlier);

    const pages = [
      await reader.listPublicTrainings("fr", { offset: 0, limit: 2 }),
      await reader.listPublicTrainings("fr", { offset: 2, limit: 2 }),
      await reader.listPublicTrainings("fr", { offset: 4, limit: 2 }),
      await reader.listPublicTrainings("fr", { offset: 6, limit: 2 }),
    ];

    expect(pages.flat().map((training) => training.slug)).toEqual([
      "it-assurance-earlier",
      "it-assurance-later",
      "it-assurance-second-topic",
      "it-gestion",
      "it-stat",
    ]);
    expect(pages[3]).toEqual([]);
    expect(pages[0][0].domain).toEqual({
      name: "it-assurance-domain-fr",
      slug: "it-assurance-domain-fr",
    });
    await expect(reader.listPublicTrainings("fr", { offset: 0, limit: 2 })).resolves.toEqual(
      pages[0],
    );
  });

  it("keeps each domain's programmes contiguous when display orders tie", async () => {
    const first = await createPublishedTaxonomy("tie-a");
    const second = await createPublishedTaxonomy("tie-b");
    const sharedCreatedAt = new Date("2026-01-01T00:00:00.000Z");

    for (const [index, taxonomy] of [first, second, first, second].entries()) {
      await createTraining(client, {
        trainingTopicId: taxonomy.topic.id,
        createdAt: sharedCreatedAt,
        translations: [{ locale: "FR", slug: `tie-${index}` }],
      });
    }

    const trainings = await reader.listPublicTrainings("fr");
    const domainSequence = trainings.map((training) => training.domain.slug);

    expect(domainSequence[0]).toBe(domainSequence[1]);
    expect(domainSequence[2]).toBe(domainSequence[3]);
    expect(domainSequence[0]).not.toBe(domainSequence[2]);
  });

  it("serves the homepage preview from the same eligible catalogue order", async () => {
    for (const [index, displayOrder] of [40, 10, 30, 20].entries()) {
      const { topic } = await createPublishedTaxonomy(`home-${index}`, {
        domainDisplayOrder: displayOrder,
      });
      await createTraining(client, {
        trainingTopicId: topic.id,
        translations: [{ locale: "FR", slug: `home-${displayOrder}` }],
      });
    }

    const preview = await getHomepageTrainingPreview("fr", reader);

    expect(preview.status).toBe("available");
    if (preview.status !== "available") return;
    expect(preview.trainings).toHaveLength(HOMEPAGE_TRAINING_LIMIT);
    expect(preview.trainings.map((training) => training.slug)).toEqual([
      "it-home-10",
      "it-home-20",
      "it-home-30",
    ]);
  });
});

describe("public alternate-locale slugs against PostgreSQL", () => {
  it("returns only published alternates whose own ancestry is published in that locale", async () => {
    const { topic } = await createPublishedTaxonomy("alt", {
      publishedLocales: ["FR", "EN", "PT"],
      unpublishedTopicLocales: ["PT"],
    });
    await createTraining(client, {
      trainingTopicId: topic.id,
      translations: [
        { locale: "FR", slug: "gestion-des-sinistres" },
        { locale: "EN", slug: "claims-management" },
        { locale: "PT", slug: "gestao-de-sinistros" },
      ],
    });

    await expect(
      reader.listPublicTrainingAlternates("fr", "it-gestion-des-sinistres"),
    ).resolves.toEqual([{ locale: "en", slug: "it-claims-management" }]);
    await expect(
      reader.listPublicTrainingAlternates("en", "it-claims-management"),
    ).resolves.toEqual([{ locale: "fr", slug: "it-gestion-des-sinistres" }]);
    await expect(
      reader.listPublicTrainingAlternates("pt", "it-gestao-de-sinistros"),
    ).resolves.toEqual([]);
  });

  it("never returns an unpublished training translation", async () => {
    const { topic } = await createPublishedTaxonomy("unpublished-alt", {
      publishedLocales: ["FR", "EN"],
    });
    await createTraining(client, {
      trainingTopicId: topic.id,
      translations: [
        { locale: "FR", slug: "visible-fr" },
        { locale: "EN", slug: "hidden-en", isPublished: false },
      ],
    });

    await expect(reader.listPublicTrainingAlternates("fr", "it-visible-fr")).resolves.toEqual([]);
    await expect(reader.listPublicTrainingAlternates("en", "it-hidden-en")).resolves.toEqual([]);
  });

  it("does not resolve a slug looked up under the wrong locale", async () => {
    const { topic } = await createPublishedTaxonomy("wrong-locale", {
      publishedLocales: ["FR", "EN"],
    });
    await createTraining(client, {
      trainingTopicId: topic.id,
      translations: [
        { locale: "FR", slug: "wrong-locale-fr" },
        { locale: "EN", slug: "wrong-locale-en" },
      ],
    });

    await expect(reader.listPublicTrainingAlternates("en", "it-wrong-locale-fr")).resolves.toEqual(
      [],
    );
    await expect(reader.getPublicTrainingBySlug("en", "it-wrong-locale-fr")).resolves.toBeNull();
  });

  it("returns no alternates when the source domain is a draft", async () => {
    const { topic } = await createPublishedTaxonomy("draft-alt", {
      domainStatus: "DRAFT",
      publishedLocales: ["FR", "EN"],
    });
    await createTraining(client, {
      trainingTopicId: topic.id,
      translations: [
        { locale: "FR", slug: "draft-alt-fr" },
        { locale: "EN", slug: "draft-alt-en" },
      ],
    });

    await expect(reader.listPublicTrainingAlternates("fr", "it-draft-alt-fr")).resolves.toEqual([]);
  });
});
