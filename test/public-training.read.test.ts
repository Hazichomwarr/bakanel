import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createPublicTrainingReader } from "../lib/public/training.read";

describe("public training reader", () => {
  it("uses full English ancestry eligibility and a bounded deterministic list", async () => {
    const training = { findMany: vi.fn().mockResolvedValue([]) };
    const reader = createPublicTrainingReader({ training } as unknown as PrismaClient);
    await reader.listPublicTrainings("en", { offset: 3, limit: 999 });
    expect(training.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 48,
        skip: 3,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        where: expect.objectContaining({
          status: "PUBLISHED",
          translations: { some: { locale: "EN", isPublished: true } },
        }),
      }),
    );
  });
  it("keeps a guessed unpublished slug inside the database eligibility query", async () => {
    const training = { findFirst: vi.fn().mockResolvedValue(null) };
    const reader = createPublicTrainingReader({ training } as unknown as PrismaClient);
    await expect(reader.getPublicTrainingBySlug("fr", "secret")).resolves.toBeNull();
    expect(training.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          translations: { some: { locale: "FR", slug: "secret", isPublished: true } },
        }),
      }),
    );
  });
  it("maps only allowlisted translation fields into a public DTO", async () => {
    const training = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { translations: [{ slug: "gestion", title: "Gestion", summary: null, id: "private" }] },
        ]),
    };
    const reader = createPublicTrainingReader({ training } as unknown as PrismaClient);

    await expect(reader.listPublicTrainings("fr")).resolves.toEqual([
      { slug: "gestion", title: "Gestion", summary: null },
    ]);
  });

  it("normalizes invalid pagination to the bounded default", async () => {
    const training = { findMany: vi.fn().mockResolvedValue([]) };
    const reader = createPublicTrainingReader({ training } as unknown as PrismaClient);
    await reader.listPublicTrainings("pt", { offset: -4, limit: 0 });

    expect(training.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 12 }));
  });
});
