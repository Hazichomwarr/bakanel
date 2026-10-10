import { CatalogueStatus, Locale, type PrismaClient } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admin/catalogue.actions", () => ({
  lifecycleAction: vi.fn(),
  translationPublicationAction: vi.fn(),
}));

import {
  ADMIN_PROGRAMME_PAGE_SIZE,
  adminProgrammePage,
  createAdminCatalogueReader,
} from "../lib/admin/catalogue.read";
import { ProgrammeList, programmeTitle } from "../app/admin/(workspace)/formations/programme-list";

type ProgrammeResult = Parameters<typeof ProgrammeList>[0]["result"];

function readerWith(total: number) {
  const training = {
    count: vi.fn().mockResolvedValue(total),
    findMany: vi.fn().mockResolvedValue([]),
  };

  return { training, reader: createAdminCatalogueReader({ training } as unknown as PrismaClient) };
}

function programme(
  id: string,
  status: CatalogueStatus,
  translations: Array<{ locale: Locale; title: string; isPublished: boolean }>,
) {
  return {
    id,
    status,
    translations,
    trainingTopic: {
      translations: [{ name: "Sinistres" }],
      trainingDomain: { translations: [{ name: "Assurance" }] },
    },
  };
}

function render(result: ProgrammeResult) {
  return renderToStaticMarkup(<ProgrammeList result={result} />);
}

describe("admin programme reader", () => {
  it("lists every lifecycle status in a bounded, deterministic page", async () => {
    const { training, reader } = readerWith(60);

    await reader.programmes(2);

    const query = training.findMany.mock.calls[0][0];
    expect(query).not.toHaveProperty("where");
    expect(training.count.mock.calls[0]).toEqual([]);
    expect(query).toMatchObject({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: ADMIN_PROGRAMME_PAGE_SIZE,
      take: ADMIN_PROGRAMME_PAGE_SIZE,
    });
    expect(query.select).toMatchObject({
      id: true,
      status: true,
      translations: { select: { locale: true, title: true, isPublished: true } },
    });
  });

  it("clamps a page beyond the end to the last page", async () => {
    const { training, reader } = readerWith(30);

    const result = await reader.programmes(999);

    expect(result).toMatchObject({ page: 2, pageCount: 2, total: 30 });
    expect(training.findMany.mock.calls[0][0].skip).toBe(ADMIN_PROGRAMME_PAGE_SIZE);
  });

  it("reports one page for an empty catalogue", async () => {
    const { reader } = readerWith(0);

    await expect(reader.programmes(3)).resolves.toMatchObject({ page: 1, pageCount: 1, total: 0 });
  });

  it.each([
    [undefined, 1],
    ["2", 2],
    ["0", 1],
    ["-1", 1],
    ["1.5", 1],
    ["abc", 1],
    [["2", "3"], 1],
    ["99999999999999999999", 1],
  ])("parses the page parameter %j as %i", (value, expected) => {
    expect(adminProgrammePage(value as string | string[] | undefined)).toBe(expected);
  });
});

describe("admin programme list", () => {
  it("links each programme to its existing admin detail route with status and translations", () => {
    const markup = render({
      total: 3,
      page: 1,
      pageCount: 1,
      programmes: [
        programme("draft-id", CatalogueStatus.DRAFT, [
          { locale: Locale.FR, title: "Gestion des sinistres", isPublished: false },
        ]),
        programme("published-id", CatalogueStatus.PUBLISHED, [
          { locale: Locale.FR, title: "Réassurance", isPublished: true },
          { locale: Locale.EN, title: "Reinsurance", isPublished: true },
        ]),
        programme("archived-id", CatalogueStatus.ARCHIVED, [
          { locale: Locale.FR, title: "Ancien programme", isPublished: true },
        ]),
      ],
    });

    expect(markup).toContain('href="/admin/formations/draft-id"');
    expect(markup).toContain('href="/admin/formations/published-id"');
    expect(markup).toContain('href="/admin/formations/archived-id"');
    expect(markup).toContain("Brouillon");
    expect(markup).toContain("Publié");
    expect(markup).toContain("Archivé");
    expect(markup).toContain("Assurance → Sinistres");
    expect(markup).toContain("FR visible · EN visible · PT absente");
    expect(markup).toContain("3 formations, tous états confondus");
  });

  it("falls back to another locale's title, marked as such, or to a neutral label", () => {
    expect(
      programmeTitle({
        translations: [{ locale: Locale.EN, title: "Claims", isPublished: false }],
      }),
    ).toEqual({ title: "Claims", fallbackLocale: "EN" });
    expect(programmeTitle({ translations: [] })).toEqual({
      title: "Formation sans titre",
      fallbackLocale: null,
    });
  });

  it("shows an explicit empty state", () => {
    const markup = render({ total: 0, page: 1, pageCount: 1, programmes: [] });

    expect(markup).toContain("Aucune formation");
    expect(markup).not.toContain("<nav");
  });

  it("offers labelled previous and next links between pages", () => {
    const markup = render({
      total: 60,
      page: 2,
      pageCount: 3,
      programmes: [
        programme("middle-id", CatalogueStatus.PUBLISHED, [
          { locale: Locale.FR, title: "Milieu", isPublished: true },
        ]),
      ],
    });

    expect(markup).toContain('aria-label="Pagination des formations"');
    expect(markup).toContain('href="/admin/formations#programmes"');
    expect(markup).toContain('href="/admin/formations?page=3#programmes"');
    expect(markup).toContain("page 2 sur 3");
  });
});
