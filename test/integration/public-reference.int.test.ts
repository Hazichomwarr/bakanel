import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPublicReferenceReader } from "@/lib/public/reference.read";

import { resetPublicContent } from "./support/fixtures";
import { createTestPrismaClient } from "./support/test-prisma";

let client: PrismaClient;
let reader: ReturnType<typeof createPublicReferenceReader>;

function createOrganization(name: string, isActive = true) {
  return client.clientOrganization.create({
    data: {
      name: `it-${name}`,
      logoReference: `/images/it-${name}.png`,
      country: "TD",
      isActive,
    },
  });
}

type EngagementFixture = {
  status?: "DRAFT" | "COMPLETED";
  visibility?: "PUBLIC" | "PRIVATE";
  endDate?: string | null;
  translations?: Array<{
    locale: "FR" | "EN" | "PT";
    title?: string;
    isPublished?: boolean;
  }>;
};

function createEngagement(organizationId: string, label: string, input: EngagementFixture = {}) {
  const translations = input.translations ?? [{ locale: "FR" }];

  return client.clientEngagement.create({
    data: {
      clientOrganizationId: organizationId,
      type: "AUDIT",
      status: input.status ?? "COMPLETED",
      visibility: input.visibility ?? "PUBLIC",
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate:
        input.endDate === null ? null : new Date(`${input.endDate ?? "2025-06-30"}T00:00:00.000Z`),
      translations: {
        create: translations.map((translation) => ({
          locale: translation.locale,
          title: translation.title ?? `it-${label} ${translation.locale}`,
          description: `it-${label} description ${translation.locale}`,
          isPublished: translation.isPublished ?? true,
        })),
      },
    },
  });
}

beforeAll(() => {
  client = createTestPrismaClient();
  reader = createPublicReferenceReader(client);
});

beforeEach(async () => {
  await resetPublicContent(client);
});

afterAll(async () => {
  await client.$disconnect();
});

describe("public reference reader against PostgreSQL", () => {
  it("returns only COMPLETED, PUBLIC engagements with a published nonempty locale title", async () => {
    const organization = await createOrganization("client");
    await createEngagement(organization.id, "eligible");
    await createEngagement(organization.id, "private", { visibility: "PRIVATE" });
    await createEngagement(organization.id, "draft-public", { status: "DRAFT" });
    await createEngagement(organization.id, "unpublished", {
      translations: [{ locale: "FR", isPublished: false }],
    });
    await createEngagement(organization.id, "empty-title", {
      translations: [{ locale: "FR", title: "" }],
    });
    await createEngagement(organization.id, "english-only", { translations: [{ locale: "EN" }] });

    const references = await reader.listPublicReferences("fr");

    expect(references.map((reference) => reference.title)).toEqual(["it-eligible FR"]);
  });

  it("keeps a completed public engagement of an inactive organization visible", async () => {
    const inactiveOrganization = await createOrganization("former-client", false);
    await createEngagement(inactiveOrganization.id, "historical");

    await expect(reader.listPublicReferences("fr")).resolves.toEqual([
      {
        organizationName: "it-former-client",
        organizationLogoReference: "/images/it-former-client.png",
        title: "it-historical FR",
        description: "it-historical description FR",
      },
    ]);
  });

  it("is unaffected by any number of private engagements", async () => {
    const organization = await createOrganization("confidential-client");
    await createEngagement(organization.id, "public-one");

    const before = await reader.listPublicReferences("fr");

    for (let index = 0; index < 5; index += 1) {
      await createEngagement(organization.id, `private-${index}`, { visibility: "PRIVATE" });
    }

    const after = await reader.listPublicReferences("fr");

    expect(after).toEqual(before);
    await expect(client.clientEngagement.count()).resolves.toBe(6);
  });

  it("exposes only organization name, logo, and the requested locale's title and description", async () => {
    const organization = await createOrganization("projection");
    await createEngagement(organization.id, "bilingual", {
      translations: [{ locale: "FR" }, { locale: "PT" }],
    });

    const [reference] = await reader.listPublicReferences("pt");

    expect(Object.keys(reference).sort()).toEqual([
      "description",
      "organizationLogoReference",
      "organizationName",
      "title",
    ]);
    expect(reference.title).toBe("it-bilingual PT");
    expect(JSON.stringify(reference)).not.toMatch(/TD|AUDIT|COMPLETED|PUBLIC|FR|[0-9a-f]{8}-/);
  });

  it("orders by end date descending with undated engagements last, then by ID", async () => {
    const organization = await createOrganization("ordering");
    await createEngagement(organization.id, "undated", { endDate: null });
    await createEngagement(organization.id, "older", { endDate: "2024-01-31" });
    await createEngagement(organization.id, "newer", { endDate: "2025-12-31" });

    const references = await reader.listPublicReferences("fr", { limit: 2 });
    const nextPage = await reader.listPublicReferences("fr", { offset: 2, limit: 2 });

    expect([...references, ...nextPage].map((reference) => reference.title)).toEqual([
      "it-newer FR",
      "it-older FR",
      "it-undated FR",
    ]);
  });
});
