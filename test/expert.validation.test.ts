import { describe, expect, it } from "vitest";
import { ExpertDomainError } from "../lib/expert.errors";
import { normalizeDisplayOrder, normalizeExpertName, normalizeOptionalText } from "../lib/expert.validation";

describe("Expert validation", () => {
  it("trims a canonical name without rewriting it", () => {
    expect(normalizeExpertName("  Dr. Ouedraogo  ")).toBe("Dr. Ouedraogo");
  });
  it("rejects blank names and non-integer display order", () => {
    expect(() => normalizeExpertName("  ")).toThrow(expect.objectContaining({ code: "INVALID_EXPERT" satisfies ExpertDomainError["code"] }));
    expect(() => normalizeDisplayOrder(1.5)).toThrow(expect.objectContaining({ code: "INVALID_EXPERT" satisfies ExpertDomainError["code"] }));
  });
  it("accepts display order zero and normalizes blank optional profile fields", () => {
    expect(normalizeDisplayOrder(0)).toBe(0);
    expect(normalizeOptionalText(" ")).toBeNull();
    expect(normalizeOptionalText(" Directeur ")).toBe("Directeur");
  });
});
