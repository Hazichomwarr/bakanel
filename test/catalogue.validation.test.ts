import { describe, expect, it } from "vitest";
import { CatalogueDomainError } from "../lib/catalogue.errors";
import { normalizeSlug } from "../lib/catalogue.validation";

describe("catalogue slug validation", () => {
  it("normalizes whitespace and separators", () => {
    expect(normalizeSlug("  Gestion de projets  ")).toBe("gestion-de-projets");
  });
  it("normalizes accented Latin text deterministically", () => {
    expect(normalizeSlug("Études & Audits")).toBe("etudes-audits");
  });
  it("rejects a slug that normalizes to empty", () => {
    expect(() => normalizeSlug(" --- ")).toThrow(expect.objectContaining({ code: "INVALID_SLUG" satisfies CatalogueDomainError["code"] }));
  });
});
