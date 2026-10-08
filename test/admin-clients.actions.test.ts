import { EngagementType, Locale } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClientWorkDomainError } from "../lib/client-work.errors";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  createOrganization: vi.fn(), updateOrganization: vi.fn(), activateOrganization: vi.fn(), deactivateOrganization: vi.fn(),
  createEngagement: vi.fn(), updateEngagement: vi.fn(), completeEngagement: vi.fn(), makePublic: vi.fn(), makePrivate: vi.fn(),
  saveTranslation: vi.fn(), publishTranslation: vi.fn(), unpublishTranslation: vi.fn(), revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: async () => {
  if (!mocks.authenticated) throw Object.assign(new Error("redirect"), { redirectTo: "/admin/login" });
} }));
vi.mock("@/lib/client-work.service", () => ({ clientWorkService: {
  createClientOrganization: (...args: unknown[]) => mocks.createOrganization(...args),
  updateClientOrganization: (...args: unknown[]) => mocks.updateOrganization(...args),
  activateClientOrganization: (...args: unknown[]) => mocks.activateOrganization(...args),
  deactivateClientOrganization: (...args: unknown[]) => mocks.deactivateOrganization(...args),
  createClientEngagementWithTranslation: (...args: unknown[]) => mocks.createEngagement(...args),
  updateClientEngagement: (...args: unknown[]) => mocks.updateEngagement(...args),
  completeClientEngagement: (...args: unknown[]) => mocks.completeEngagement(...args),
  makeClientEngagementPublic: (...args: unknown[]) => mocks.makePublic(...args),
  makeClientEngagementPrivate: (...args: unknown[]) => mocks.makePrivate(...args),
  upsertClientEngagementTranslation: (...args: unknown[]) => mocks.saveTranslation(...args),
  publishClientEngagementTranslation: (...args: unknown[]) => mocks.publishTranslation(...args),
  unpublishClientEngagementTranslation: (...args: unknown[]) => mocks.unpublishTranslation(...args),
} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error("redirect"), { redirectTo: path }); } }));

import { createEngagementAction, createOrganizationAction, engagementAction, engagementTranslationPublicationAction, organizationLifecycleAction, saveEngagementAction, saveEngagementTranslationAction, saveOrganizationAction } from "../lib/admin/clients.actions";

function formData(values: Record<string, string>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

const organization = { name: "ONEA", country: "BF", logoReference: "logo.png" };
const mission = { clientOrganizationId: "organization-1", type: EngagementType.AUDIT, locale: Locale.FR, title: "Audit qualité", startDate: "2026-06-01", endDate: "2026-06-02" };
const redirectTo = (path: string) => expect.objectContaining({ redirectTo: path });

beforeEach(() => {
  mocks.authenticated = true;
  for (const mock of Object.values(mocks)) if (typeof mock === "function") mock.mockReset();
});

describe("organization action boundary", () => {
  it("authenticates before organization persistence", async () => {
    mocks.authenticated = false;
    await expect(createOrganizationAction({}, formData(organization))).rejects.toEqual(redirectTo("/admin/login"));
    expect(mocks.createOrganization).not.toHaveBeenCalled();
  });

  it("creates and edits organizations through the domain service", async () => {
    mocks.createOrganization.mockResolvedValue({ id: "organization-1" });
    await expect(createOrganizationAction({}, formData(organization))).rejects.toEqual(redirectTo("/admin/clients/organization-1"));
    expect(mocks.createOrganization).toHaveBeenCalledWith(organization);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/clients/organization-1");

    await expect(saveOrganizationAction({}, formData({ ...organization, id: "organization-1", name: "ONEA SA" }))).rejects.toEqual(redirectTo("/admin/clients/organization-1"));
    expect(mocks.updateOrganization).toHaveBeenCalledWith("organization-1", { ...organization, name: "ONEA SA" });
  });

  it.each([["activate", "activateOrganization"], ["deactivate", "deactivateOrganization"]] as const)("delegates %s to the organization lifecycle service", async (intent, mockName) => {
    await expect(organizationLifecycleAction({}, formData({ id: "organization-1", intent }))).rejects.toEqual(redirectTo("/admin/clients/organization-1"));
    expect(mocks[mockName]).toHaveBeenCalledWith("organization-1");
  });
});

describe("mission action boundary", () => {
  it("uses the route-bound organization identity and rejects tampering before persistence", async () => {
    mocks.createEngagement.mockResolvedValue({ id: "mission-1" });
    await expect(createEngagementAction("organization-1", {}, formData(mission))).rejects.toEqual(redirectTo("/admin/clients/missions/mission-1"));
    expect(mocks.createEngagement).toHaveBeenCalledWith(expect.objectContaining({ clientOrganizationId: "organization-1" }), expect.objectContaining({ locale: Locale.FR }));

    mocks.createEngagement.mockReset();
    await expect(createEngagementAction("organization-1", {}, formData({ ...mission, clientOrganizationId: "organization-2" }))).resolves.toEqual({ error: "Renseignez le type, le titre et des dates valides." });
    expect(mocks.createEngagement).not.toHaveBeenCalled();
  });

  it("delegates draft updates, completion, and both visibility changes", async () => {
    await expect(saveEngagementAction({}, formData({ id: "mission-1", type: EngagementType.TRAINING, startDate: "2026-07-01", endDate: "2026-07-02" }))).rejects.toEqual(redirectTo("/admin/clients/missions/mission-1"));
    expect(mocks.updateEngagement).toHaveBeenCalledWith("mission-1", expect.objectContaining({ type: EngagementType.TRAINING }));

    for (const [intent, mock] of [["complete", mocks.completeEngagement], ["public", mocks.makePublic], ["private", mocks.makePrivate]] as const) {
      await expect(engagementAction({}, formData({ id: "mission-1", intent }))).rejects.toEqual(redirectTo("/admin/clients/missions/mission-1"));
      expect(mock).toHaveBeenCalledWith("mission-1");
    }
  });
});

describe("translation action boundary", () => {
  it.each([Locale.FR, Locale.EN, Locale.PT])("saves the selected %s translation", async (locale) => {
    await expect(saveEngagementTranslationAction({}, formData({ id: "mission-1", locale, title: `${locale} title`, description: "Description" }))).rejects.toEqual(redirectTo(`/admin/clients/missions/mission-1?locale=${locale}`));
    expect(mocks.saveTranslation).toHaveBeenCalledWith("mission-1", { locale, title: `${locale} title`, description: "Description" });
  });

  it.each([["publish", "publishTranslation"], ["unpublish", "unpublishTranslation"]] as const)("delegates %s without changing visibility", async (intent, mockName) => {
    await expect(engagementTranslationPublicationAction({}, formData({ id: "mission-1", locale: Locale.PT, intent }))).rejects.toEqual(redirectTo("/admin/clients/missions/mission-1?locale=PT"));
    expect(mocks[mockName]).toHaveBeenCalledWith("mission-1", Locale.PT);
    expect(mocks.makePublic).not.toHaveBeenCalled();
  });
});

it("maps typed domain failures to a French administrative message", async () => {
  mocks.completeEngagement.mockRejectedValue(new ClientWorkDomainError("STALE_CLIENT_ENGAGEMENT_STATE", "stale"));
  await expect(engagementAction({}, formData({ id: "mission-1", intent: "complete" }))).resolves.toEqual({ error: "Cette mission a été modifiée entre-temps. Actualisez puis réessayez." });
});
