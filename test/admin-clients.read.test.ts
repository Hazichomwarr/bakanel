import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createAdminClientsReader } from "../lib/admin/clients.read";

describe("admin client reads", () => {
  it("uses deterministic organization ordering and authoritative engagement counts", async () => {
    const clientOrganization = { findMany: vi.fn().mockResolvedValue([{ id: "org-1", name: "ONEA", _count: { engagements: 3 } }]) };
    const reader = createAdminClientsReader({ clientOrganization } as unknown as PrismaClient);

    await expect(reader.directory()).resolves.toEqual([{ id: "org-1", name: "ONEA", _count: { engagements: 3 } }]);
    expect(clientOrganization.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ name: "asc" }, { id: "asc" }], select: expect.objectContaining({ _count: { select: { engagements: true } } }) }));
  });

  it("requests a bounded history that retains completed private missions for administrators", async () => {
    const history = [{ id: "mission-1", status: "COMPLETED", visibility: "PRIVATE", translations: [] }];
    const clientOrganization = { findUnique: vi.fn().mockResolvedValue({ id: "org-1", engagements: history }) };
    const reader = createAdminClientsReader({ clientOrganization } as unknown as PrismaClient);

    await expect(reader.organization("org-1")).resolves.toEqual({ id: "org-1", engagements: history });
    expect(clientOrganization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-1" }, select: expect.objectContaining({ engagements: expect.objectContaining({ take: 30, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }) }) }));
  });

  it("returns available translations so an absent locale remains an honest UI fallback", async () => {
    const clientEngagement = { findUnique: vi.fn().mockResolvedValue({ id: "mission-1", translations: [{ locale: "FR", title: "Audit" }] }) };
    const reader = createAdminClientsReader({ clientEngagement } as unknown as PrismaClient);

    const engagement = await reader.engagement("mission-1");
    expect(engagement?.translations.find((translation) => translation.locale === "EN")).toBeUndefined();
    expect(clientEngagement.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ translations: expect.objectContaining({ select: expect.objectContaining({ locale: true, title: true }) }) }) }));
  });
});
