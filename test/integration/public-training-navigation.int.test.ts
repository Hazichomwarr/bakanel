import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPublicTrainingNavigationReader } from "@/lib/public/training-navigation.read";
import { createPublicTrainingReader } from "@/lib/public/training.read";
import { PUBLIC_TRAINING_NAVIGATION_TOPIC_LIMIT } from "@/lib/public/training-navigation.read";

import { createDomain, createTopic, createTraining, resetPublicContent } from "./support/fixtures";
import { createTestPrismaClient } from "./support/test-prisma";

let client: PrismaClient;
let navigationReader: ReturnType<typeof createPublicTrainingNavigationReader>;
let catalogueReader: ReturnType<typeof createPublicTrainingReader>;

beforeAll(() => {
  client = createTestPrismaClient();
  navigationReader = createPublicTrainingNavigationReader(client);
  catalogueReader = createPublicTrainingReader(client);
});

beforeEach(async () => {
  await resetPublicContent(client);
});

afterAll(async () => {
  await client.$disconnect();
});

async function createEligibleTaxonomy(
  name: string,
  options: {
    domainDisplayOrder?: number;
    topicDisplayOrder?: number;
    locales?: Array<"FR" | "EN" | "PT">;
    topicStatus?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    trainingStatus?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    trainingPublishedLocales?: Array<"FR" | "EN" | "PT">;
  } = {},
) {
  const locales = options.locales ?? ["FR", "EN", "PT"];
  const domain = await createDomain(client, {
    displayOrder: options.domainDisplayOrder,
    translations: locales.map((locale) => ({
      locale,
      slug: `${name}-domain-${locale.toLowerCase()}`,
    })),
  });
  const topic = await createTopic(client, {
    trainingDomainId: domain.id,
    displayOrder: options.topicDisplayOrder,
    status: options.topicStatus,
    translations: locales.map((locale) => ({
      locale,
      slug: `${name}-topic-${locale.toLowerCase()}`,
    })),
  });
  const training = await createTraining(client, {
    trainingTopicId: topic.id,
    status: options.trainingStatus,
    translations: locales.map((locale) => ({
      locale,
      slug: `${name}-training-${locale.toLowerCase()}`,
      isPublished: options.trainingPublishedLocales?.includes(locale) ?? true,
    })),
  });

  return { domain, topic, training };
}

describe("public training navigation against PostgreSQL", () => {
  it("returns only requested-locale eligible hierarchy in stable display order", async () => {
    await createEligibleTaxonomy("later", { domainDisplayOrder: 20, topicDisplayOrder: 20 });
    await createEligibleTaxonomy("first", { domainDisplayOrder: 10, topicDisplayOrder: 10 });
    await createEligibleTaxonomy("draft-topic", { topicStatus: "DRAFT" });
    await createEligibleTaxonomy("unpublished-fr", { trainingPublishedLocales: ["EN", "PT"] });

    await expect(navigationReader.getPublicTrainingNavigation("fr")).resolves.toEqual({
      catalogueHref: "/fr/formations",
      domains: [
        {
          name: "it-first-domain-fr",
          slug: "it-first-domain-fr",
          topics: [{ name: "it-first-topic-fr", slug: "it-first-topic-fr" }],
        },
        {
          name: "it-later-domain-fr",
          slug: "it-later-domain-fr",
          topics: [{ name: "it-later-topic-fr", slug: "it-later-topic-fr" }],
        },
      ],
    });

    await expect(navigationReader.getPublicTrainingNavigation("en")).resolves.toMatchObject({
      domains: expect.arrayContaining([
        expect.objectContaining({
          slug: "it-unpublished-fr-domain-en",
          topics: [expect.objectContaining({ slug: "it-unpublished-fr-topic-en" })],
        }),
      ]),
    });
  });

  it("never disagrees with the catalogue reader about an eligible navigation topic", async () => {
    await createEligibleTaxonomy("matching");

    const navigation = await navigationReader.getPublicTrainingNavigation("pt");
    const topic = navigation.domains[0]?.topics[0];

    expect(topic).toBeDefined();
    await expect(
      catalogueReader.listPublicTrainings("pt", {
        filter: { kind: "topic", slug: topic?.slug ?? "" },
      }),
    ).resolves.toHaveLength(1);
  });

  it("bounds the navigation while retaining the complete catalogue link", async () => {
    for (let index = 0; index < 13; index += 1) {
      await createEligibleTaxonomy(`bounded-${index}`, { domainDisplayOrder: index });
    }

    const navigation = await navigationReader.getPublicTrainingNavigation("fr");

    expect(navigation.catalogueHref).toBe("/fr/formations");
    expect(navigation.domains).toHaveLength(12);
    expect(navigation.domains.map((domain) => domain.slug)).toEqual(
      Array.from({ length: 12 }, (_, index) => `it-bounded-${index}-domain-fr`),
    );
  });

  it("bounds topics within each domain in their stable display order", async () => {
    const domain = await createDomain(client, {
      translations: [{ locale: "FR", slug: "topic-bound-domain" }],
    });

    for (let index = 0; index < PUBLIC_TRAINING_NAVIGATION_TOPIC_LIMIT + 1; index += 1) {
      const topic = await createTopic(client, {
        trainingDomainId: domain.id,
        displayOrder: index,
        translations: [{ locale: "FR", slug: `topic-bound-${index}` }],
      });
      await createTraining(client, {
        trainingTopicId: topic.id,
        translations: [{ locale: "FR", slug: `topic-bound-training-${index}` }],
      });
    }

    const navigation = await navigationReader.getPublicTrainingNavigation("fr");

    expect(navigation.domains).toEqual([
      {
        name: "it-topic-bound-domain",
        slug: "it-topic-bound-domain",
        topics: Array.from({ length: PUBLIC_TRAINING_NAVIGATION_TOPIC_LIMIT }, (_, index) => ({
          name: `it-topic-bound-${index}`,
          slug: `it-topic-bound-${index}`,
        })),
      },
    ]);
  });

  it("reflects publication changes without restarting the reader", async () => {
    const fixture = await createEligibleTaxonomy("live", { trainingStatus: "DRAFT" });

    await expect(navigationReader.getPublicTrainingNavigation("fr")).resolves.toMatchObject({
      domains: [],
    });

    await client.training.update({
      where: { id: fixture.training.id },
      data: { status: "PUBLISHED" },
    });
    await expect(navigationReader.getPublicTrainingNavigation("fr")).resolves.toMatchObject({
      domains: [expect.objectContaining({ slug: "it-live-domain-fr" })],
    });

    await client.training.update({
      where: { id: fixture.training.id },
      data: { status: "ARCHIVED" },
    });
    await expect(navigationReader.getPublicTrainingNavigation("fr")).resolves.toMatchObject({
      domains: [],
    });

    await client.training.update({
      where: { id: fixture.training.id },
      data: { status: "PUBLISHED" },
    });
    await client.trainingTranslation.update({
      where: { trainingId_locale: { trainingId: fixture.training.id, locale: "FR" } },
      data: { isPublished: false },
    });
    await expect(navigationReader.getPublicTrainingNavigation("fr")).resolves.toMatchObject({
      domains: [],
    });
    await expect(navigationReader.getPublicTrainingNavigation("en")).resolves.toMatchObject({
      domains: [expect.objectContaining({ slug: "it-live-domain-en" })],
    });
  });
});
