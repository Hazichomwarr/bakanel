import { afterEach, describe, expect, it } from "vitest";
import { dashboardSessionStatusLabel, formatDashboardDate, formatDashboardPrice } from "../lib/admin/dashboard.presentation";

describe("admin dashboard presentation", () => {
  it("keeps DateOnly values on their calendar date in French", () => {
    expect(formatDashboardDate(new Date("2026-10-06T00:00:00.000Z"))).toMatch(/6 octobre 2026/);
  });
  it("renders XOF as CFA and honors on-request pricing", () => {
    expect(formatDashboardPrice({ pricingMode: "FIXED", price: "250000", currency: "XOF" })).toMatch(/250[\s\u202f]?000 CFA/);
    expect(formatDashboardPrice({ pricingMode: "ON_REQUEST", price: null, currency: null })).toBe("Sur devis");
  });
});

describe("admin dashboard presentation (expanded)", () => {
  const originalTimezone = process.env.TZ;
  afterEach(() => { process.env.TZ = originalTimezone; });

  it.each(["America/Los_Angeles", "Pacific/Kiritimati", "Africa/Ouagadougou", "UTC"])("formats a calendar date identically when the process runs in %s", (timezone) => {
    process.env.TZ = timezone;
    expect(formatDashboardDate(new Date("2026-10-06T00:00:00.000Z"))).toBe("6 octobre 2026");
    expect(formatDashboardDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("1 janvier 2026");
  });

  it("shows fixed XOF prices as CFA, never the raw currency code", () => {
    const formatted = formatDashboardPrice({ pricingMode: "FIXED", price: "150000", currency: "XOF" });
    expect(formatted.replace(/[\s  ]/g, " ")).toBe("150 000 CFA");
    expect(formatted).not.toContain("XOF");
  });

  it("shows ON_REQUEST as « Sur devis », never as 0 CFA, even with stray price data", () => {
    for (const pricing of [{ price: null, currency: null }, { price: "0", currency: "XOF" }, { price: "250000", currency: "XOF" }]) {
      const formatted = formatDashboardPrice({ pricingMode: "ON_REQUEST", ...pricing });
      expect(formatted).toBe("Sur devis");
      expect(formatted).not.toMatch(/0\s*CFA|XOF/);
    }
  });

  it("maps every status the dashboard can render to French", () => {
    expect(dashboardSessionStatusLabel("OPEN")).toBe("Inscriptions ouvertes");
    expect(dashboardSessionStatusLabel("CLOSED")).toBe("Inscriptions closes");
  });
});
