import { CatalogueStatus, Locale, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createPublicCatalogueReader } from "../lib/catalogue.read";

function readerWithCapturedWhere() {
  let where: unknown;
  const client = {
    trainingDomain: { findMany: async (args: { where: unknown }) => { where = args.where; return []; } },
    trainingTopic: { findMany: async (args: { where: unknown }) => { where = args.where; return []; } },
    training: { findMany: async (args: { where: unknown }) => { where = args.where; return []; }, findFirst: async (args: { where: unknown }) => { where = args.where; return null; } },
  };
  return { reader: createPublicCatalogueReader(client as unknown as PrismaClient), where: () => where };
}

describe("public catalogue reachability", () => {
  it("requires a published domain and locale translation for topics", async () => {
    const captured = readerWithCapturedWhere();
    await captured.reader.publicTopics("domain", Locale.FR);
    expect(captured.where()).toMatchObject({ status: CatalogueStatus.PUBLISHED, trainingDomain: { status: CatalogueStatus.PUBLISHED, translations: { some: { locale: Locale.FR, isPublished: true } } } });
  });
  it("requires the complete published ancestor chain for a training slug", async () => {
    const captured = readerWithCapturedWhere();
    await captured.reader.publicTrainingBySlug("assurances", Locale.PT);
    expect(captured.where()).toMatchObject({ status: CatalogueStatus.PUBLISHED, translations: { some: { locale: Locale.PT, slug: "assurances", isPublished: true } }, trainingTopic: { status: CatalogueStatus.PUBLISHED, trainingDomain: { status: CatalogueStatus.PUBLISHED } } });
  });
});
