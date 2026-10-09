import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PublicLocale } from "@/lib/public/locale";
import { createPublicTrainingReader } from "@/lib/public/training.read";

import {
  createDomain,
  createPublishedTraining,
  createTopic,
  createTraining,
  resetPublicContent,
} from "./support/fixtures";
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

describe("public catalogue readers against PostgreSQL", () => {
  it("lists a published domain only in locales whose translation is published", async () => {
    await createDomain(client, {
      translations: [
        { locale: "FR", slug: "finance-fr" },
        { locale: "EN", slug: "finance-en", isPublished: false },
      ],
    });

    await expect(reader.listPublicTrainingDomains("fr")).resolves.toEqual([
      { name: "it-finance-fr", slug: "it-finance-fr" },
    ]);
    await expect(reader.listPublicTrainingDomains("en")).resolves.toEqual([]);
    await expect(reader.listPublicTrainingDomains("pt")).resolves.toEqual([]);
  });

  it("excludes DRAFT and ARCHIVED domains even with published translations", async () => {
    await createDomain(client, {
      status: "DRAFT",
      translations: [{ locale: "FR", slug: "draft" }],
    });
    await createDomain(client, {
      status: "ARCHIVED",
      translations: [{ locale: "FR", slug: "archived" }],
    });

    await expect(reader.listPublicTrainingDomains("fr")).resolves.toEqual([]);
  });

  it("hides a published topic whose domain is unpublished", async () => {
    const draftDomain = await createDomain(client, {
      status: "DRAFT",
      translations: [{ locale: "FR", slug: "hidden-domain" }],
    });
    await createTopic(client, {
      trainingDomainId: draftDomain.id,
      translations: [{ locale: "FR", slug: "orphan-topic" }],
    });

    await expect(reader.listPublicTrainingTopics("fr")).resolves.toEqual([]);
  });

  it("hides a published training whose topic is unpublished, in lists and by slug", async () => {
    const domain = await createDomain(client, { translations: [{ locale: "FR", slug: "domain" }] });
    const draftTopic = await createTopic(client, {
      trainingDomainId: domain.id,
      status: "DRAFT",
      translations: [{ locale: "FR", slug: "draft-topic" }],
    });
    await createTraining(client, {
      trainingTopicId: draftTopic.id,
      translations: [{ locale: "FR", slug: "ancestry-bypass" }],
    });

    await expect(reader.listPublicTrainings("fr")).resolves.toEqual([]);
    await expect(reader.getPublicTrainingBySlug("fr", "it-ancestry-bypass")).resolves.toBeNull();
  });

  it("requires a published translation in the requested locale for training discovery", async () => {
    const training = await createPublishedTraining(client, "risk", ["FR"]);
    await client.trainingTranslation.create({
      data: {
        trainingId: training.id,
        locale: "EN",
        slug: "it-risk-en-unpublished",
        title: "it-risk-en-unpublished title",
        isPublished: false,
      },
    });

    await expect(reader.listPublicTrainings("fr")).resolves.toHaveLength(1);
    await expect(reader.listPublicTrainings("en")).resolves.toEqual([]);
    await expect(
      reader.getPublicTrainingBySlug("en", "it-risk-en-unpublished"),
    ).resolves.toBeNull();
  });

  it("resolves a slug only in its own locale and returns only that locale's fields", async () => {
    await createPublishedTraining(client, "audit", ["FR", "EN"]);

    await expect(reader.getPublicTrainingBySlug("fr", "it-audit-fr")).resolves.toEqual({
      slug: "it-audit-fr",
      title: "it-audit-fr title",
      summary: "it-audit-fr summary",
    });
    await expect(reader.getPublicTrainingBySlug("fr", "it-audit-en")).resolves.toBeNull();
    await expect(reader.getPublicTrainingBySlug("pt", "it-audit-fr")).resolves.toBeNull();
  });

  it("paginates trainings deterministically with the internal ID tie-breaker", async () => {
    const domain = await createDomain(client, { translations: [{ locale: "FR", slug: "d" }] });
    const topic = await createTopic(client, {
      trainingDomainId: domain.id,
      translations: [{ locale: "FR", slug: "t" }],
    });
    const sharedCreatedAt = new Date("2026-01-01T00:00:00.000Z");
    const created: Array<{ id: string; slug: string }> = [];

    for (const letter of ["a", "b", "c", "d", "e"]) {
      const training = await createTraining(client, {
        trainingTopicId: topic.id,
        createdAt: sharedCreatedAt,
        translations: [{ locale: "FR", slug: `page-${letter}` }],
      });
      created.push({ id: training.id, slug: `it-page-${letter}` });
    }

    const expectedSlugOrder = created
      .sort((left, right) => (left.id < right.id ? -1 : 1))
      .map((training) => training.slug);

    const firstPage = await reader.listPublicTrainings("fr", { offset: 0, limit: 2 });
    const secondPage = await reader.listPublicTrainings("fr", { offset: 2, limit: 2 });
    const lastPage = await reader.listPublicTrainings("fr", { offset: 4, limit: 2 });
    const repeatedFirstPage = await reader.listPublicTrainings("fr", { offset: 0, limit: 2 });

    expect([...firstPage, ...secondPage, ...lastPage].map((training) => training.slug)).toEqual(
      expectedSlugOrder,
    );
    expect(repeatedFirstPage).toEqual(firstPage);
  });

  it("caps an oversized page at 48 rows", async () => {
    for (let index = 0; index < 50; index += 1) {
      await createDomain(client, {
        displayOrder: index,
        translations: [{ locale: "FR", slug: `cap-${index}` }],
      });
    }

    await expect(reader.listPublicTrainingDomains("fr")).resolves.toHaveLength(48);
  });

  it("rejects an unsupported runtime locale instead of widening the query", async () => {
    await createPublishedTraining(client, "locale-guard", ["FR"]);

    await expect(reader.listPublicTrainings("de" as PublicLocale)).rejects.toThrow(
      "Unsupported public locale.",
    );
  });
});
