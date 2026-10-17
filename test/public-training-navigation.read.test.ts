import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { publicTrainingWhere } from "../lib/public/eligibility";
import {
  createPublicTrainingNavigationReader,
  PUBLIC_TRAINING_NAVIGATION_DOMAIN_LIMIT,
  PUBLIC_TRAINING_NAVIGATION_TOPIC_LIMIT,
} from "../lib/public/training-navigation.read";

describe("public training navigation reader", () => {
  it("selects a bounded requested-locale hierarchy with the catalogue eligibility predicate", async () => {
    const trainingDomain = {
      findMany: vi.fn().mockResolvedValue([
        {
          translations: [{ name: "Assurance", slug: "assurance" }],
          topics: [{ translations: [{ name: "Sinistres", slug: "sinistres" }] }],
        },
      ]),
    };
    const reader = createPublicTrainingNavigationReader({
      trainingDomain,
    } as unknown as PrismaClient);

    await expect(reader.getPublicTrainingNavigation("fr")).resolves.toEqual({
      catalogueHref: "/fr/formations",
      domains: [
        {
          name: "Assurance",
          slug: "assurance",
          topics: [{ name: "Sinistres", slug: "sinistres" }],
        },
      ],
    });

    expect(trainingDomain.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: PUBLIC_TRAINING_NAVIGATION_DOMAIN_LIMIT,
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        where: expect.objectContaining({
          topics: {
            some: expect.objectContaining({ trainings: { some: publicTrainingWhere("fr") } }),
          },
        }),
        select: expect.objectContaining({
          topics: expect.objectContaining({
            take: PUBLIC_TRAINING_NAVIGATION_TOPIC_LIMIT,
            orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
          }),
        }),
      }),
    );
  });

  it("drops malformed query rows rather than exposing incomplete localized labels", async () => {
    const trainingDomain = {
      findMany: vi.fn().mockResolvedValue([
        { translations: [], topics: [{ translations: [{ name: "Hidden", slug: "hidden" }] }] },
        { translations: [{ name: "Empty", slug: "empty" }], topics: [{ translations: [] }] },
      ]),
    };
    const reader = createPublicTrainingNavigationReader({
      trainingDomain,
    } as unknown as PrismaClient);

    await expect(reader.getPublicTrainingNavigation("en")).resolves.toEqual({
      catalogueHref: "/en/formations",
      domains: [],
    });
  });
});
