import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ authenticated: true, calls: [] as string[], create: vi.fn(), translate: vi.fn() }));

vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: async () => { h.calls.push("requireAdmin"); if (!h.authenticated) throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: "/admin/login" }); return { id: "admin", email: "admin@example.com", name: "Awa" }; } }));
vi.mock("@/lib/catalogue.service", () => ({ catalogueService: { createTrainingDomain: (...args: unknown[]) => h.create(...args), upsertTrainingDomainTranslation: (...args: unknown[]) => h.translate(...args) } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: path }); } }));

import { createDomainAction } from "../lib/admin/catalogue.actions";
import { CatalogueDomainError } from "../lib/catalogue.errors";

const form = (values: Record<string, string>) => { const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data; };

describe("admin catalogue action boundary", () => {
  beforeEach(() => { h.authenticated = true; h.calls.length = 0; h.create.mockReset(); h.translate.mockReset(); });

  it("authenticates before any create service call", async () => {
    h.authenticated = false;
    await expect(createDomainAction({}, form({ locale: "FR", name: "Assurances", slug: "assurances" }))).rejects.toMatchObject({ redirectTo: "/admin/login" });
    expect(h.calls).toEqual(["requireAdmin"]);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("creates the entity then attaches a locale translation through the domain service", async () => {
    h.create.mockResolvedValue({ id: "domain-1" }); h.translate.mockResolvedValue({});
    await expect(createDomainAction({}, form({ locale: "FR", name: "Assurances", slug: "assurances", displayOrder: "3" }))).rejects.toMatchObject({ redirectTo: "/admin/formations/domaines/domain-1" });
    expect(h.create).toHaveBeenCalledWith(3);
    expect(h.translate).toHaveBeenCalledWith("domain-1", expect.objectContaining({ locale: "FR", name: "Assurances", slug: "assurances" }));
  });

  it("maps typed stale-write errors to calm French feedback", async () => {
    h.create.mockRejectedValue(new CatalogueDomainError("STALE_CATALOGUE_STATE", "stale"));
    await expect(createDomainAction({}, form({ locale: "FR", name: "Assurances", slug: "assurances" }))).resolves.toEqual({ error: "Cet élément a été modifié entre-temps. Actualisez la page puis réessayez." });
  });
});
