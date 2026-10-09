import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPublicExpertReader } from "@/lib/public/expert.read";

import { createPublishedTraining, resetPublicContent } from "./support/fixtures";
import { createTestPrismaClient } from "./support/test-prisma";

let client: PrismaClient;
let reader: ReturnType<typeof createPublicExpertReader>;

type ExpertTranslationFixture = {
  locale: "FR" | "EN" | "PT";
  isPublished?: boolean;
};

function createExpert(
  name: string,
  input: {
    status?: "ACTIVE" | "INACTIVE";
    displayOrder?: number;
    translations: ExpertTranslationFixture[];
  },
) {
  return client.expert.create({
    data: {
      name: `it-${name}`,
      status: input.status ?? "ACTIVE",
      displayOrder: input.displayOrder ?? 0,
      portraitReference: `/images/it-${name}.jpg`,
      translations: {
        create: input.translations.map((translation) => ({
          locale: translation.locale,
          professionalTitle: `it-${name} title ${translation.locale}`,
          specialization: `it-${name} specialization ${translation.locale}`,
          biography: `it-${name} biography ${translation.locale}`,
          isPublished: translation.isPublished ?? true,
        })),
      },
    },
  });
}

beforeAll(() => {
  client = createTestPrismaClient();
  reader = createPublicExpertReader(client);
});

beforeEach(async () => {
  await resetPublicContent(client);
});

afterAll(async () => {
  await client.$disconnect();
});

describe("public expert reader against PostgreSQL", () => {
  it("lists ACTIVE experts with a published requested-locale translation, in display order", async () => {
    await createExpert("second", { displayOrder: 2, translations: [{ locale: "FR" }] });
    await createExpert("first", { displayOrder: 1, translations: [{ locale: "FR" }] });
    await createExpert("inactive", {
      status: "INACTIVE",
      translations: [{ locale: "FR" }],
    });
    await createExpert("unpublished", { translations: [{ locale: "FR", isPublished: false }] });
    await createExpert("english-only", { translations: [{ locale: "EN" }] });

    const experts = await reader.listPublicExperts("fr");

    expect(experts.map((expert) => expert.name)).toEqual(["it-first", "it-second"]);
  });

  it("returns only the requested locale's presentation and no identifiers", async () => {
    await createExpert("bilingual", { translations: [{ locale: "FR" }, { locale: "EN" }] });

    const [expert] = await reader.listPublicExperts("en");

    expect(expert).toEqual({
      name: "it-bilingual",
      professionalTitle: "it-bilingual title EN",
      specialization: "it-bilingual specialization EN",
      biography: "it-bilingual biography EN",
      portraitReference: "/images/it-bilingual.jpg",
    });
  });

  it("leaves an inactive expert's historical session assignment intact", async () => {
    const expert = await createExpert("former", {
      status: "INACTIVE",
      translations: [{ locale: "FR" }],
    });
    const training = await createPublishedTraining(client, "history");
    const session = await client.trainingSession.create({
      data: {
        trainingId: training.id,
        status: "COMPLETED",
        startDate: new Date("2026-01-10T00:00:00.000Z"),
        endDate: new Date("2026-01-12T00:00:00.000Z"),
        deliveryMode: "ONLINE",
        pricingMode: "ON_REQUEST",
      },
    });
    await client.trainingSessionExpert.create({
      data: { trainingSessionId: session.id, expertId: expert.id },
    });

    await expect(reader.listPublicExperts("fr")).resolves.toEqual([]);
    await expect(
      client.trainingSessionExpert.count({ where: { expertId: expert.id } }),
    ).resolves.toBe(1);
  });
});
