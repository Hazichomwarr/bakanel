import { ExpertStatus, Locale, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createPublicExpertReader } from "../lib/expert.read";

describe("public Expert visibility", () => {
  it("requires ACTIVE status and a published requested translation with deterministic ordering", async () => {
    let args: unknown;
    const reader = createPublicExpertReader({ expert: { findMany: async (value: unknown) => { args = value; return []; } } } as unknown as PrismaClient);
    await reader.listPublicExperts(Locale.FR);
    expect(args).toMatchObject({ where: { status: ExpertStatus.ACTIVE, translations: { some: { locale: Locale.FR, isPublished: true } } }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }] });
  });
});
