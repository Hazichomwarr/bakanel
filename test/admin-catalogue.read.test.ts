import { CatalogueStatus, Locale, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createAdminCatalogueReader } from "../lib/admin/catalogue.read";

describe("admin catalogue projections", () => {
  it("reads the hierarchy in one bounded overview projection without hiding drafts, archives, or missing translations", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const reader = createAdminCatalogueReader({ trainingDomain: { findMany } } as unknown as PrismaClient);
    await reader.overview();
    expect(findMany).toHaveBeenCalledTimes(1);
    const query = findMany.mock.calls[0]?.[0];
    expect(query).toMatchObject({ orderBy: { displayOrder: "asc" }, select: { id: true, status: true, translations: { select: { locale: true, name: true } }, topics: { select: { id: true, trainings: { select: { id: true } } } } } });
    expect(query).not.toHaveProperty("where");
  });

  it("keeps selectors bounded to domains and their direct topics", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const reader = createAdminCatalogueReader({ trainingDomain: { findMany } } as unknown as PrismaClient);
    await reader.selectors();
    const query = findMany.mock.calls[0]?.[0];
    expect(query).toMatchObject({ select: { id: true, topics: { select: { id: true, trainingDomainId: true } } } });
    expect(JSON.stringify(query)).not.toContain("trainings");
  });

  it("does not derive lifecycle state from French translation availability", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "domain", status: CatalogueStatus.ARCHIVED, translations: [], topics: [{ id: "topic", status: CatalogueStatus.DRAFT, translations: [], trainings: [{ id: "training", status: CatalogueStatus.PUBLISHED, translations: [] }] }] }]);
    const reader = createAdminCatalogueReader({ trainingDomain: { findMany } } as unknown as PrismaClient);
    const overview = await reader.overview();
    expect(overview[0]).toMatchObject({ status: CatalogueStatus.ARCHIVED, translations: [], topics: [{ status: CatalogueStatus.DRAFT, trainings: [{ status: CatalogueStatus.PUBLISHED }] }] });
  });

  it("exposes the supported presentation locales", async () => {
    const { catalogueLocales } = await import("../lib/admin/catalogue.read");
    expect(catalogueLocales).toEqual([Locale.FR, Locale.EN, Locale.PT]);
  });
});
