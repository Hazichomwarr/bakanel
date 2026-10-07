/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, isValidElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  authenticated: true,
  pathname: "/admin",
  dashboard: undefined as any,
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/current-admin", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireAdmin: async () => {
    h.calls.push("requireAdmin");
    if (!h.authenticated) throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: "/admin/login" });
    return { id: "admin-1", email: "admin@example.com", name: "Awa" };
  },
}));
vi.mock("@/lib/admin/dashboard.read", () => ({
  adminDashboardReader: { read: async () => { h.calls.push("dashboard.read"); return h.dashboard; } },
}));
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname, redirect: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: any) => createElement("a", { href, ...props }, children) }));

import { changePasswordAction, logoutAction } from "../app/admin/auth-actions";
import { AuthForm } from "../app/admin/auth-form";
import AdminActualitesPage from "../app/admin/(workspace)/actualites/page";
import AdminClientsPage from "../app/admin/(workspace)/clients/page";
import AdminAccountPage from "../app/admin/(workspace)/compte/page";
import AdminExpertsPage from "../app/admin/(workspace)/experts/page";
import AdminFormationsPage from "../app/admin/(workspace)/formations/page";
import { AdminNavigation } from "../app/admin/(workspace)/navigation";
import AdminDashboardPage from "../app/admin/(workspace)/page";
import AdminSessionsPage from "../app/admin/(workspace)/sessions/page";

const emptyDashboard = () => ({
  metrics: { publishedTrainings: 0, upcomingSessions: 0, activeExperts: 0, publicEngagements: 0, publishedArticles: 0 },
  attention: { draftTrainings: 0, draftSessions: 0, draftArticles: 0 },
  upcomingSessions: [],
});
const populatedDashboard = () => ({
  ...emptyDashboard(),
  metrics: { publishedTrainings: 4, upcomingSessions: 2, activeExperts: 3, publicEngagements: 5, publishedArticles: 6 },
  upcomingSessions: [
    { id: "s1", title: "Management de la qualité", startDate: new Date("2026-10-06T00:00:00.000Z"), location: "Ouagadougou", status: "OPEN", pricingMode: "FIXED", price: "250000", currency: "XOF" },
    { id: "s2", title: "Formation sans titre français", startDate: new Date("2026-10-09T00:00:00.000Z"), location: "En ligne", status: "CLOSED", pricingMode: "ON_REQUEST", price: null, currency: null },
  ],
});
const redirectOf = (promise: Promise<unknown>) => promise.then(() => undefined, (error: any) => error.redirectTo);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

beforeEach(() => {
  h.calls.length = 0;
  h.authenticated = true;
  h.pathname = "/admin";
  h.dashboard = populatedDashboard();
});

describe("workspace pages authenticate server-side through requireAdmin()", () => {
  const pages = [
    ["/admin", AdminDashboardPage],
    ["/admin/formations", AdminFormationsPage],
    ["/admin/sessions", AdminSessionsPage],
    ["/admin/experts", AdminExpertsPage],
    ["/admin/clients", AdminClientsPage],
    ["/admin/actualites", AdminActualitesPage],
    ["/admin/compte", AdminAccountPage],
  ] as const;

  it.each(pages)("%s redirects to login when requireAdmin() rejects the session", async (_path, Page) => {
    h.authenticated = false;
    expect(await redirectOf((Page as () => Promise<unknown>)())).toBe("/admin/login");
  });

  it("authenticates before any dashboard query, so an unauthenticated request reads nothing", async () => {
    h.authenticated = false;
    await redirectOf(AdminDashboardPage());
    expect(h.calls).toEqual(["requireAdmin"]);
    h.authenticated = true;
    h.calls.length = 0;
    await AdminDashboardPage();
    expect(h.calls).toEqual(["requireAdmin", "dashboard.read"]);
  });

  const workspaceDir = join(__dirname, "..", "app", "admin", "(workspace)");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; });

  it("no workspace module implements its own cookie or session handling", () => {
    for (const file of files(workspaceDir)) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(workspaceDir, file)).not.toMatch(/next\/headers|cookies\(|lib\/auth\/(session|cookie|admin-auth\.service)|hashSessionToken|sessionCookieName/);
    }
  });

  it("every workspace page calls the shared requireAdmin(), and the layout does too", () => {
    const pageFiles = files(workspaceDir).filter((file) => /(^|\/)(page|layout)\.tsx$/.test(file));
    expect(pageFiles.length).toBe(8);
    for (const file of pageFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(workspaceDir, file)).toContain('from "@/lib/auth/current-admin"');
      expect(source, relative(workspaceDir, file)).toMatch(/await requireAdmin\(\)/);
    }
  });

  it("exposes no route handlers in the workspace", () => {
    expect(files(workspaceDir).filter((file) => /(^|\/)route\.(t|j)sx?$/.test(file))).toEqual([]);
  });
});

describe("account and logout reuse the ADMIN-1 Server Actions", () => {
  const find = (node: ReactNode, predicate: (element: any) => boolean): any => {
    if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return undefined; }
    if (!isValidElement(node)) return undefined;
    return predicate(node) ? node : find((node.props as any).children, predicate);
  };

  it("/admin/compte renders the established password-change action", async () => {
    const form = find(await AdminAccountPage(), (element) => element.type === AuthForm);
    expect(form.props.action).toBe(changePasswordAction);
    expect(form.props.fields.map((field: any) => field.name)).toEqual(["currentPassword", "newPassword", "confirmation"]);
  });

  it("logout is a POST form bound to the established logoutAction", () => {
    const source = readFileSync(join(__dirname, "..", "app", "admin", "(workspace)", "navigation.tsx"), "utf8");
    expect(source).toContain('import { logoutAction } from "../auth-actions";');
    expect(source).toMatch(/<form action=\{logoutAction\}><button type="submit"/);
    expect(typeof logoutAction).toBe("function");
  });
});

describe("rendered dashboard", () => {
  const RAW_ENUMS = /\b(OPEN|CLOSED|DRAFT|CANCELLED|COMPLETED|IN_PERSON|ONLINE|FIXED|ON_REQUEST|XOF|PUBLISHED|ACTIVE)\b/;

  it("presents sessions in French with CFA, « Sur devis », remote location, and no raw enum values", async () => {
    const markup = renderToStaticMarkup(await AdminDashboardPage());
    const text = textOf(markup);
    expect(text).toContain("Management de la qualité");
    expect(text).toContain("6 octobre 2026 · Ouagadougou");
    expect(text).toContain("9 octobre 2026 · En ligne");
    expect(text).toMatch(/250\s000 CFA/);
    expect(text).toContain("Sur devis");
    expect(text).toContain("Inscriptions ouvertes");
    expect(text).toContain("Inscriptions closes");
    expect(text).not.toMatch(RAW_ENUMS);
    expect(text).not.toMatch(/(^|\s)0 CFA/);
  });

  it("uses one h1, section h2s, and session h3s", async () => {
    const markup = renderToStaticMarkup(await AdminDashboardPage());
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup.match(/<h2\b[^>]*>[^<]*/g)?.map((tag) => tag.replace(/<h2\b[^>]*>/, ""))).toEqual(["Prochaines sessions", "À traiter"]);
    expect(markup.match(/<h3\b/g)).toHaveLength(2);
    expect(markup.indexOf("<h1")).toBeLessThan(markup.indexOf("<h2"));
  });

  it("shows an explicit empty state and zero metrics when the database is empty", async () => {
    h.dashboard = emptyDashboard();
    const text = textOf(renderToStaticMarkup(await AdminDashboardPage()));
    expect(text).toContain("Aucune session à venir pour le moment.");
    expect(text).not.toMatch(RAW_ENUMS);
  });
});

describe("rendered navigation shell", () => {
  const render = (pathname: string) => { h.pathname = pathname; return renderToStaticMarkup(createElement(AdminNavigation as ComponentType<{ adminEmail: string }>, { adminEmail: "admin@example.com" }, createElement("p", null, "contenu"))); };
  const currentLinks = (markup: string) => [...markup.matchAll(/<a [^>]*href="([^"]+)"[^>]*aria-current="(page|true)"/g)].map(([, href, value]) => `${href}=${value}`);

  it("labels both navigation landmarks and marks only the current section", () => {
    const markup = render("/admin/sessions/example");
    expect(markup).toContain('<nav aria-label="Navigation principale"');
    expect(markup).toContain('<nav aria-label="Compte"');
    expect(currentLinks(markup)).toEqual(["/admin/sessions=true"]);
    expect(currentLinks(render("/admin"))).toEqual(["/admin=page"]);
    expect(currentLinks(render("/admin/compte"))).toEqual(["/admin/compte=page"]);
    expect(currentLinks(render("/admin/sessions-old"))).toEqual([]);
  });

  it("gives the mobile menu button a visible name that matches its accessible name, with state and target", () => {
    const button = render("/admin").match(/<button[^>]*aria-expanded[^>]*>[^<]*<\/button>/)?.[0] ?? "";
    expect(button).not.toContain("aria-label");
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-controls="admin-mobile-navigation"');
    expect(button).toMatch(/>Menu<\/button>$/);
  });

  it("announces the signed-in identity and renders logout as a real submit button", () => {
    const markup = render("/admin");
    expect(textOf(markup)).toContain("Connecté en tant que admin@example.com");
    expect(markup).toMatch(/<form[^>]*>\s*<button type="submit"[^>]*>Se déconnecter<\/button><\/form>/);
  });
});
