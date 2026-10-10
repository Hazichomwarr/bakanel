import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { publicTrainingWhere } from "../lib/public/eligibility";
import type { PublicLocale } from "../lib/public/locale";
import { createPublicTrainingReader } from "../lib/public/training.read";

const expectedCatalogueOrder = [
  { trainingTopic: { trainingDomain: { displayOrder: "asc" } } },
  { trainingTopic: { trainingDomainId: "asc" } },
  { trainingTopic: { displayOrder: "asc" } },
  { trainingTopicId: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

function readerWith(training: Record<string, unknown>) {
  return createPublicTrainingReader({ training } as unknown as PrismaClient);
}

/** A selected row as Prisma would return it, plus stray private fields that must not leak. */
function selectedTraining(translation: Record<string, unknown>) {
  return {
    id: "private-training-id",
    status: "PUBLISHED",
    translations: [{ id: "private-translation-id", isPublished: true, ...translation }],
    trainingTopic: {
      id: "private-topic-id",
      translations: [{ name: "Sinistres", slug: "sinistres", id: "private" }],
      trainingDomain: {
        id: "private-domain-id",
        translations: [{ name: "Assurance", slug: "assurance", id: "private" }],
      },
    },
  };
}

const publishedTaxonomy = {
  domain: { name: "Assurance", slug: "assurance" },
  topic: { name: "Sinistres", slug: "sinistres" },
};

describe("public training list reader", () => {
  it("uses full English ancestry eligibility and a bounded deterministic list", async () => {
    const training = { findMany: vi.fn().mockResolvedValue([]) };
    const reader = readerWith(training);

    await reader.listPublicTrainings("en", { offset: 3, limit: 999 });

    expect(training.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 48,
        skip: 3,
        orderBy: expectedCatalogueOrder,
        where: publicTrainingWhere("en"),
      }),
    );
  });

  it("selects taxonomy labels only from the requested locale's published translations", async () => {
    const training = { findMany: vi.fn().mockResolvedValue([]) };
    const reader = readerWith(training);
    const publishedPortugueseLabel = {
      where: { locale: "PT", isPublished: true },
      select: { name: true, slug: true },
      take: 1,
    };

    await reader.listPublicTrainings("pt");

    expect(training.findMany.mock.calls[0][0].select).toEqual({
      translations: {
        where: { locale: "PT", isPublished: true },
        select: { slug: true, title: true, summary: true },
        take: 1,
      },
      trainingTopic: {
        select: {
          translations: publishedPortugueseLabel,
          trainingDomain: { select: { translations: publishedPortugueseLabel } },
        },
      },
    });
  });

  it("maps only allowlisted fields into a card DTO", async () => {
    const training = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          selectedTraining({ slug: "gestion", title: "Gestion", summary: null }),
        ]),
    };

    await expect(readerWith(training).listPublicTrainings("fr")).resolves.toEqual([
      { slug: "gestion", title: "Gestion", summary: null, ...publishedTaxonomy },
    ]);
  });

  it("drops a card whose taxonomy label is missing instead of borrowing another locale", async () => {
    const withoutTopicLabel = selectedTraining({ slug: "a", title: "A", summary: null });
    withoutTopicLabel.trainingTopic.translations = [];
    const withoutDomainLabel = selectedTraining({ slug: "b", title: "B", summary: null });
    withoutDomainLabel.trainingTopic.trainingDomain.translations = [];
    const training = {
      findMany: vi.fn().mockResolvedValue([withoutTopicLabel, withoutDomainLabel]),
    };

    await expect(readerWith(training).listPublicTrainings("fr")).resolves.toEqual([]);
  });

  it("normalizes invalid pagination to the bounded default", async () => {
    const training = { findMany: vi.fn().mockResolvedValue([]) };

    await readerWith(training).listPublicTrainings("pt", { offset: -4, limit: 0 });

    expect(training.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 12 }));
  });

  it("rejects an unsupported locale before querying", async () => {
    const training = { findMany: vi.fn() };

    await expect(readerWith(training).listPublicTrainings("de" as PublicLocale)).rejects.toThrow(
      "Unsupported public locale.",
    );
    expect(training.findMany).not.toHaveBeenCalled();
  });

  it("does not disguise a database error as an empty catalogue", async () => {
    const databaseError = new Error("connection lost");
    const training = { findMany: vi.fn().mockRejectedValue(databaseError) };

    await expect(readerWith(training).listPublicTrainings("fr")).rejects.toBe(databaseError);
  });
});

describe("public training detail reader", () => {
  it("keeps a guessed unpublished slug inside the database eligibility query", async () => {
    const training = { findFirst: vi.fn().mockResolvedValue(null) };

    await expect(readerWith(training).getPublicTrainingBySlug("fr", "secret")).resolves.toBeNull();
    expect(training.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          trainingTopic: publicTrainingWhere("fr").trainingTopic,
          translations: { some: { locale: "FR", slug: "secret", isPublished: true } },
        }),
      }),
    );
  });

  it("selects detail sections only from the matched published translation", async () => {
    const training = { findFirst: vi.fn().mockResolvedValue(null) };

    await readerWith(training).getPublicTrainingBySlug("en", "  claims  ");

    expect(training.findFirst.mock.calls[0][0].select.translations).toEqual({
      where: { locale: "EN", slug: "claims", isPublished: true },
      select: {
        slug: true,
        title: true,
        summary: true,
        description: true,
        objectives: true,
        targetAudience: true,
        program: true,
      },
      take: 1,
    });
  });

  it("maps the detail projection without private fields or internal IDs", async () => {
    const training = {
      findFirst: vi.fn().mockResolvedValue(
        selectedTraining({
          slug: "gestion",
          title: "Gestion",
          summary: "Résumé",
          description: "Description",
          objectives: "Objectifs",
          targetAudience: "Public",
          program: "Programme",
          createdAt: new Date(),
        }),
      ),
    };

    await expect(readerWith(training).getPublicTrainingBySlug("fr", "gestion")).resolves.toEqual({
      slug: "gestion",
      title: "Gestion",
      summary: "Résumé",
      description: "Description",
      objectives: "Objectifs",
      targetAudience: "Public",
      program: "Programme",
      ...publishedTaxonomy,
    });
  });

  it("represents missing and blank optional sections as null", async () => {
    const training = {
      findFirst: vi.fn().mockResolvedValue(
        selectedTraining({
          slug: "gestion",
          title: "Gestion",
          summary: "   ",
          description: null,
          objectives: "",
          targetAudience: null,
          program: "\n",
        }),
      ),
    };

    const detail = await readerWith(training).getPublicTrainingBySlug("fr", "gestion");

    expect(detail).toMatchObject({
      summary: null,
      description: null,
      objectives: null,
      targetAudience: null,
      program: null,
    });
  });

  it("returns no detail when a taxonomy label is missing", async () => {
    const withoutDomainLabel = selectedTraining({ slug: "gestion", title: "Gestion" });
    withoutDomainLabel.trainingTopic.trainingDomain.translations = [];
    const training = { findFirst: vi.fn().mockResolvedValue(withoutDomainLabel) };

    await expect(readerWith(training).getPublicTrainingBySlug("fr", "gestion")).resolves.toBeNull();
  });

  it("returns null for an empty slug without querying", async () => {
    const training = { findFirst: vi.fn() };

    await expect(readerWith(training).getPublicTrainingBySlug("fr", "   ")).resolves.toBeNull();
    expect(training.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an unsupported locale even when the slug is empty", async () => {
    const training = { findFirst: vi.fn() };

    await expect(
      readerWith(training).getPublicTrainingBySlug("de" as PublicLocale, ""),
    ).rejects.toThrow("Unsupported public locale.");
    expect(training.findFirst).not.toHaveBeenCalled();
  });
});

describe("public training alternate-locale reader", () => {
  it("requires the source slug and each target locale to satisfy the full public predicate", async () => {
    const training = { findFirst: vi.fn().mockResolvedValue(null) };

    await readerWith(training).listPublicTrainingAlternates("fr", "gestion");

    expect(training.findFirst).toHaveBeenCalledTimes(2);
    const eligibleSource = {
      ...publicTrainingWhere("fr"),
      translations: { some: { locale: "FR", slug: "gestion", isPublished: true } },
    };
    expect(training.findFirst.mock.calls.map((call) => call[0])).toEqual([
      {
        where: { AND: [eligibleSource, publicTrainingWhere("en")] },
        select: {
          translations: {
            where: { locale: "EN", isPublished: true },
            select: { slug: true },
            take: 1,
          },
        },
      },
      {
        where: { AND: [eligibleSource, publicTrainingWhere("pt")] },
        select: {
          translations: {
            where: { locale: "PT", isPublished: true },
            select: { slug: true },
            take: 1,
          },
        },
      },
    ]);
  });

  it("returns only locales with an eligible translation, without internal IDs", async () => {
    const training = {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({ id: "private", translations: [{ slug: "claims", id: "private" }] })
        .mockResolvedValueOnce(null),
    };

    await expect(
      readerWith(training).listPublicTrainingAlternates("fr", "gestion"),
    ).resolves.toEqual([{ locale: "en", slug: "claims" }]);
  });

  it("returns no alternates for an empty slug without querying", async () => {
    const training = { findFirst: vi.fn() };

    await expect(readerWith(training).listPublicTrainingAlternates("en", " ")).resolves.toEqual([]);
    expect(training.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an unsupported locale before querying", async () => {
    const training = { findFirst: vi.fn() };

    await expect(
      readerWith(training).listPublicTrainingAlternates("de" as PublicLocale, "gestion"),
    ).rejects.toThrow("Unsupported public locale.");
    expect(training.findFirst).not.toHaveBeenCalled();
  });
});
