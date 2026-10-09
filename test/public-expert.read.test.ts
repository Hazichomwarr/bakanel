import { ExpertStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createPublicExpertReader } from "../lib/public/expert.read";

function expert(overrides: Record<string, unknown> = {}) {
  return {
    id: "internal-expert-id",
    name: "Awa Ouédraogo",
    status: ExpertStatus.ACTIVE,
    portraitReference: "experts/awa.jpg",
    displayOrder: 1,
    email: "awa.private@example.com",
    phone: "+226 70 00 00 00",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    translations: [
      {
        id: "internal-translation-id",
        expertId: "internal-expert-id",
        locale: "FR",
        professionalTitle: "Consultante senior",
        specialization: "Gestion des risques",
        biography: "Vingt ans d'expérience.",
        isPublished: true,
      },
    ],
    ...overrides,
  };
}

function readerWithExperts(experts: unknown[] = []) {
  const expertDelegate = {
    findMany: vi.fn().mockResolvedValue(experts),
  };
  const reader = createPublicExpertReader({ expert: expertDelegate } as unknown as PrismaClient);

  return { reader, expertDelegate };
}

describe("public expert reader", () => {
  it("queries only ACTIVE experts with a published translation in the requested locale", async () => {
    const { reader, expertDelegate } = readerWithExperts();

    await reader.listPublicExperts("en");

    expect(expertDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ExpertStatus.ACTIVE,
          translations: { some: { locale: "EN", isPublished: true } },
        },
      }),
    );
  });

  it("does not query INACTIVE experts, whose historical assignments stay untouched", async () => {
    const { reader, expertDelegate } = readerWithExperts();

    await reader.listPublicExperts("fr");

    const where = expertDelegate.findMany.mock.calls[0][0].where;
    expect(where.status).toBe(ExpertStatus.ACTIVE);
    expect(where.status).not.toBe(ExpertStatus.INACTIVE);
  });

  it("selects only the requested locale's published translation through an explicit projection", async () => {
    const { reader, expertDelegate } = readerWithExperts();

    await reader.listPublicExperts("pt");

    const query = expertDelegate.findMany.mock.calls[0][0];
    expect(query.include).toBeUndefined();
    expect(query.select).toEqual({
      name: true,
      portraitReference: true,
      translations: {
        where: { locale: "PT", isPublished: true },
        select: {
          professionalTitle: true,
          specialization: true,
          biography: true,
        },
        take: 1,
      },
    });
  });

  it("maps an eligible expert to a DTO without IDs, status, or private contact data", async () => {
    const { reader } = readerWithExperts([expert()]);

    const experts = await reader.listPublicExperts("fr");

    expect(experts).toEqual([
      {
        name: "Awa Ouédraogo",
        professionalTitle: "Consultante senior",
        specialization: "Gestion des risques",
        biography: "Vingt ans d'expérience.",
        portraitReference: "experts/awa.jpg",
      },
    ]);
    expect(JSON.stringify(experts)).not.toMatch(/internal|private@|\+226|ACTIVE|isPublished/);
  });

  it("omits an expert returned without a requested-locale translation", async () => {
    const { reader } = readerWithExperts([expert({ translations: [] })]);

    await expect(reader.listPublicExperts("en")).resolves.toEqual([]);
  });

  it("orders deterministically with a unique tie-breaker and bounds the page size", async () => {
    const { reader, expertDelegate } = readerWithExperts();

    await reader.listPublicExperts("fr", { offset: 24, limit: 500 });

    expect(expertDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        skip: 24,
        take: 48,
      }),
    );
  });

  it("normalizes invalid pagination to the bounded default", async () => {
    const { reader, expertDelegate } = readerWithExperts();

    await reader.listPublicExperts("fr", { offset: 1.5, limit: -3 });

    expect(expertDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 12 }),
    );
  });
});
