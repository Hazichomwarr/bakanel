import { describe, expect, it } from "vitest";
import { adminNavigationCurrent, isAdminNavigationActive, primaryAdminNavigation, secondaryAdminNavigation } from "../lib/admin/navigation";

describe("admin navigation", () => {
  it("matches exact and nested section paths", () => {
    expect(isAdminNavigationActive("/admin/sessions/123", "/admin/sessions")).toBe(true);
    expect(isAdminNavigationActive("/admin", "/admin")).toBe(true);
  });
  it("does not use a loose prefix match", () => {
    expect(isAdminNavigationActive("/admin/formations-archive", "/admin/formations")).toBe(false);
    expect(isAdminNavigationActive("/admin/formations", "/admin")).toBe(false);
  });
});

describe("admin navigation (route matrix)", () => {
  const items = [...primaryAdminNavigation, ...secondaryAdminNavigation].map((item) => item.href);
  const activeFor = (pathname: string) => items.filter((href) => isAdminNavigationActive(pathname, href));

  it.each([
    ["/admin", ["/admin"]],
    ["/admin/formations", ["/admin/formations"]],
    ["/admin/formations/example", ["/admin/formations"]],
    ["/admin/sessions", ["/admin/sessions"]],
    ["/admin/sessions/example", ["/admin/sessions"]],
    ["/admin/experts", ["/admin/experts"]],
    ["/admin/clients", ["/admin/clients"]],
    ["/admin/actualites", ["/admin/actualites"]],
    ["/admin/compte", ["/admin/compte"]],
  ])("%s activates exactly %j", (pathname, expected) => {
    expect(activeFor(pathname)).toEqual(expected);
  });

  it.each(["/admin/formations-archive", "/admin/sessions-old", "/admin/clientsomething", "/admin/comptes", "/administration", "/admin-old"])("false-prefix path %s activates nothing", (pathname) => {
    expect(activeFor(pathname)).toEqual([]);
  });

  it("never leaves the overview active on a sub-route", () => {
    for (const href of items.filter((href) => href !== "/admin")) {
      expect(isAdminNavigationActive(href, "/admin")).toBe(false);
      expect(isAdminNavigationActive(`${href}/nested`, "/admin")).toBe(false);
    }
  });

  it("exposes aria-current=page on the section route and true on nested routes", () => {
    expect(adminNavigationCurrent("/admin/sessions", "/admin/sessions")).toBe("page");
    expect(adminNavigationCurrent("/admin/sessions/example", "/admin/sessions")).toBe("true");
    expect(adminNavigationCurrent("/admin/sessions-old", "/admin/sessions")).toBeUndefined();
    expect(adminNavigationCurrent("/admin/sessions", "/admin")).toBeUndefined();
  });
});
