import { Locale } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  create: vi.fn(),
  publish: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/current-admin", () => ({
  requireAdmin: async () => {
    if (!mocks.authenticated)
      throw Object.assign(new Error("redirect"), { redirectTo: "/admin/login" });
  },
}));
vi.mock("@/lib/article.service", () => ({
  articleService: {
    createArticleWithTranslation: (...args: unknown[]) => mocks.create(...args),
    publishArticle: (...args: unknown[]) => mocks.publish(...args),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Object.assign(new Error("redirect"), { redirectTo: path });
  },
}));

import { articleLifecycleAction, createArticleAction } from "../lib/admin/articles.actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const translation = {
  locale: Locale.FR,
  slug: "audit-2026",
  title: "Audit 2026",
  content: "Contenu",
};

beforeEach(() => {
  mocks.authenticated = true;
  mocks.create.mockReset();
  mocks.publish.mockReset();
  mocks.revalidatePath.mockReset();
});

describe("admin article actions", () => {
  it("authenticates before it attempts atomic article creation", async () => {
    mocks.authenticated = false;

    await expect(createArticleAction({}, form(translation))).rejects.toEqual(
      expect.objectContaining({ redirectTo: "/admin/login" }),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates the article and initial translation through one service operation", async () => {
    mocks.create.mockResolvedValue({ id: "article-1" });

    await expect(createArticleAction({}, form(translation))).rejects.toEqual(
      expect.objectContaining({ redirectTo: "/admin/actualites/article-1" }),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      { coverReference: null },
      expect.objectContaining(translation),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/actualites/article-1");
  });

  it("rejects a route identity mismatch without calling the lifecycle service", async () => {
    await expect(
      articleLifecycleAction("article-1", {}, form({ id: "article-2", intent: "publish" })),
    ).resolves.toEqual({ error: "L’identité de l’article ne correspond pas." });

    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
