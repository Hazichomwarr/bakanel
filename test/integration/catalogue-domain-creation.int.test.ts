import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CatalogueDomainError } from "@/lib/catalogue.errors";
import { createCatalogueService } from "@/lib/catalogue.service";

import { resetPublicContent } from "./support/fixtures";
import { createTestPrismaClient } from "./support/test-prisma";

let client: PrismaClient;
let catalogue: ReturnType<typeof createCatalogueService>;

function domainTranslation(slug: string) {
  return {
    locale: "FR" as const,
    name: `it-${slug}`,
    slug: `it-${slug}`,
  };
}

async function errorCode(operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    if (error instanceof CatalogueDomainError) {
      return error.code;
    }

    throw error;
  }

  return null;
}

beforeAll(() => {
  client = createTestPrismaClient();
  catalogue = createCatalogueService(client);
});

beforeEach(async () => {
  await resetPublicContent(client);
});

afterAll(async () => {
  await client.$disconnect();
});

describe("atomic training domain creation against PostgreSQL", () => {
  it("persists exactly one domain with its initial translation", async () => {
    const domain = await catalogue.createTrainingDomainWithTranslation(
      4,
      domainTranslation("assurance"),
    );

    await expect(
      client.trainingDomain.findUnique({
        where: { id: domain.id },
        include: { translations: true },
      }),
    ).resolves.toMatchObject({
      displayOrder: 4,
      translations: [
        {
          locale: "FR",
          name: "it-assurance",
          slug: "it-assurance",
        },
      ],
    });
  });

  it("rolls back the domain when the initial translation slug conflicts", async () => {
    const existing = await catalogue.createTrainingDomainWithTranslation(
      1,
      domainTranslation("unique-slug"),
    );

    await expect(
      errorCode(
        catalogue.createTrainingDomainWithTranslation(9, {
          locale: "FR",
          name: "it-conflict-candidate",
          slug: "it-unique-slug",
        }),
      ),
    ).resolves.toBe("SLUG_CONFLICT");

    await expect(
      client.trainingDomain.findMany({
        include: { translations: true },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: existing.id,
        displayOrder: 1,
        translations: [
          expect.objectContaining({
            locale: "FR",
            name: "it-unique-slug",
            slug: "it-unique-slug",
          }),
        ],
      }),
    ]);
  });

  it("leaves no domain behind when translation validation fails", async () => {
    await expect(
      errorCode(
        catalogue.createTrainingDomainWithTranslation(3, {
          locale: "FR",
          name: "it-invalid-slug",
          slug: "***",
        }),
      ),
    ).resolves.toBe("INVALID_SLUG");

    await expect(client.trainingDomain.count()).resolves.toBe(0);
    await expect(client.trainingDomainTranslation.count()).resolves.toBe(0);
  });

  it("allows at most one concurrent complete pair for the same localized slug", async () => {
    const results = await Promise.all([
      errorCode(catalogue.createTrainingDomainWithTranslation(1, domainTranslation("concurrent"))),
      errorCode(catalogue.createTrainingDomainWithTranslation(2, domainTranslation("concurrent"))),
    ]);

    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(results.filter((result) => result === "SLUG_CONFLICT")).toHaveLength(1);
    await expect(client.trainingDomain.count()).resolves.toBe(1);
    await expect(client.trainingDomainTranslation.count()).resolves.toBe(1);
  });

  it("keeps translation editing and domain lifecycle operations available", async () => {
    const domain = await catalogue.createTrainingDomainWithTranslation(
      0,
      domainTranslation("lifecycle"),
    );

    await catalogue.upsertTrainingDomainTranslation(domain.id, {
      locale: "FR",
      name: "it-lifecycle-updated",
      slug: "it-lifecycle-updated",
    });
    await catalogue.publishTrainingDomain(domain.id);
    await catalogue.publishTrainingDomainTranslation(domain.id, "FR");
    await catalogue.archiveTrainingDomain(domain.id);

    await expect(
      client.trainingDomain.findUnique({
        where: { id: domain.id },
        include: { translations: true },
      }),
    ).resolves.toMatchObject({
      status: "ARCHIVED",
      translations: [
        expect.objectContaining({
          slug: "it-lifecycle-updated",
          isPublished: true,
        }),
      ],
    });
  });
});
