import { EngagementStatus, EngagementVisibility, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createPublicReferenceReader } from "../lib/public/reference.read";

function reference(overrides: Record<string, unknown> = {}) {
  return {
    id: "internal-engagement-id",
    clientOrganizationId: "internal-organization-id",
    type: "AUDIT",
    status: EngagementStatus.COMPLETED,
    visibility: EngagementVisibility.PUBLIC,
    amount: "9500000.00",
    internalNotes: "Confidential negotiation notes",
    clientOrganization: {
      id: "internal-organization-id",
      name: "Star Assurances du Tchad",
      logoReference: "clients/star.png",
      isActive: false,
      contactEmail: "dg.private@example.com",
      contactPhone: "+235 60 00 00 00",
    },
    translations: [
      {
        id: "internal-translation-id",
        locale: "FR",
        title: "Audit du dispositif de contrôle interne",
        description: "Mission réalisée en 2025.",
        isPublished: true,
      },
    ],
    ...overrides,
  };
}

function readerWithReferences(references: unknown[] = []) {
  const clientEngagement = {
    findMany: vi.fn().mockResolvedValue(references),
  };
  const reader = createPublicReferenceReader({ clientEngagement } as unknown as PrismaClient);

  return { reader, clientEngagement };
}

describe("public reference reader", () => {
  it("requires COMPLETED status, explicit PUBLIC visibility, and a published nonempty locale title in the query", async () => {
    const { reader, clientEngagement } = readerWithReferences();

    await reader.listPublicReferences("en");

    expect(clientEngagement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: EngagementStatus.COMPLETED,
          visibility: EngagementVisibility.PUBLIC,
          translations: {
            some: { locale: "EN", isPublished: true, title: { not: "" } },
          },
        },
      }),
    );
  });

  it("never asks the database for PRIVATE or DRAFT engagements to filter afterward", async () => {
    const { reader, clientEngagement } = readerWithReferences();

    await reader.listPublicReferences("fr");

    const where = clientEngagement.findMany.mock.calls[0][0].where;
    expect(where.visibility).toBe(EngagementVisibility.PUBLIC);
    expect(where.visibility).not.toBe(EngagementVisibility.PRIVATE);
    expect(where.status).toBe(EngagementStatus.COMPLETED);
    expect(where.status).not.toBe(EngagementStatus.DRAFT);
  });

  it("does not require an active organization for a valid historical public engagement", async () => {
    const { reader, clientEngagement } = readerWithReferences([reference()]);

    const references = await reader.listPublicReferences("fr");

    const where = clientEngagement.findMany.mock.calls[0][0].where;
    expect(Object.keys(where)).not.toContain("clientOrganization");
    expect(references).toHaveLength(1);
  });

  it("projects only public organization and requested-locale translation fields", async () => {
    const { reader, clientEngagement } = readerWithReferences();

    await reader.listPublicReferences("pt");

    const query = clientEngagement.findMany.mock.calls[0][0];
    expect(query.include).toBeUndefined();
    expect(query.select).toEqual({
      clientOrganization: {
        select: {
          name: true,
          logoReference: true,
        },
      },
      translations: {
        where: { locale: "PT", isPublished: true, title: { not: "" } },
        select: {
          title: true,
          description: true,
        },
        take: 1,
      },
    });
  });

  it("maps to a DTO without contacts, financial amounts, notes, IDs, or lifecycle metadata", async () => {
    const { reader } = readerWithReferences([reference()]);

    const references = await reader.listPublicReferences("fr");

    expect(references).toEqual([
      {
        organizationName: "Star Assurances du Tchad",
        organizationLogoReference: "clients/star.png",
        title: "Audit du dispositif de contrôle interne",
        description: "Mission réalisée en 2025.",
      },
    ]);
    expect(JSON.stringify(references)).not.toMatch(
      /internal|private@|\+235|9500000|Confidential|COMPLETED|PUBLIC|isActive/,
    );
  });

  it("omits an engagement returned without a published requested-locale translation", async () => {
    const { reader } = readerWithReferences([reference({ translations: [] })]);

    await expect(reader.listPublicReferences("en")).resolves.toEqual([]);
  });

  it("returns only a list of DTOs and never a total or private count", async () => {
    const { reader, clientEngagement } = readerWithReferences([reference()]);

    const references = await reader.listPublicReferences("fr");

    expect(Array.isArray(references)).toBe(true);
    expect(Object.keys(clientEngagement)).toEqual(["findMany"]);
  });

  it("orders by end date with a unique tie-breaker and bounds the page size", async () => {
    const { reader, clientEngagement } = readerWithReferences();

    await reader.listPublicReferences("fr", { offset: 12, limit: 1000 });

    expect(clientEngagement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ endDate: { sort: "desc", nulls: "last" } }, { id: "asc" }],
        skip: 12,
        take: 48,
      }),
    );
  });

  it("normalizes invalid pagination to the bounded default", async () => {
    const { reader, clientEngagement } = readerWithReferences();

    await reader.listPublicReferences("fr", { offset: -1, limit: Number.NaN });

    expect(clientEngagement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 12 }),
    );
  });
});
