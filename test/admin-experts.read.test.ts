import { describe, expect, it, vi } from "vitest";
import { ExpertStatus, Locale, type PrismaClient } from "@prisma/client";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createAdminExpertsReader, expertLabel } from "../lib/admin/experts.read";

describe("admin experts reader", () => {
  it("groups authoritative lifecycle states with deterministic ordering and aggregate session counts", async () => {
    const expert = { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) };
    await createAdminExpertsReader({ expert } as unknown as PrismaClient).workspace();
    expect(expert.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { status: ExpertStatus.ACTIVE }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }], select: expect.objectContaining({ _count: { select: { sessionAssignments: true } } }) }));
    expect(expert.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { status: ExpertStatus.INACTIVE } }));
  });
  it("loads bounded session history without filtering the expert or its assigned relationship by active status", async () => {
    const expert = { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) };
    await createAdminExpertsReader({ expert } as unknown as PrismaClient).detail("expert-1");
    expect(expert.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "expert-1" },
      select: expect.objectContaining({ sessionAssignments: expect.objectContaining({ take: 20 }) }),
    }));
    expect(expertLabel({ name: "Awa", translations: [] })).toBe("Présentation française à renseigner");
    expect(expertLabel({ name: "Awa", translations: [{ locale: Locale.FR, professionalTitle: "Formatrice" }] })).toBe("Formatrice");
  });
});
