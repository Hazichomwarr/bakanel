import { describe, expect, it } from "vitest";
import { ClientWorkDomainError } from "../lib/client-work.errors";
import { normalizeEngagementDates, normalizeOrganizationName } from "../lib/client-work.validation";
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
describe("client-work validation", () => {
  it("trims organization names and rejects blanks", () => { expect(normalizeOrganizationName("  STAR  ")).toBe("STAR"); expect(() => normalizeOrganizationName(" ")).toThrow(expect.objectContaining({ code: "INVALID_CLIENT_ORGANIZATION" satisfies ClientWorkDomainError["code"] })); });
  it("accepts same-day engagement dates and rejects inverted dates", () => { expect(normalizeEngagementDates(date("2026-01-01"), date("2026-01-01"))).toBeTruthy(); expect(() => normalizeEngagementDates(date("2026-01-02"), date("2026-01-01"))).toThrow(expect.objectContaining({ code: "INVALID_ENGAGEMENT_DATES" satisfies ClientWorkDomainError["code"] })); });
});
