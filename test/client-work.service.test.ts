/* eslint-disable @typescript-eslint/no-explicit-any */
import { EngagementStatus, EngagementType, EngagementVisibility, Locale, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { ClientWorkDomainError } from "../lib/client-work.errors";
import { createClientWorkService } from "../lib/client-work.service";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const TODAY = new Date("2026-06-15T12:00:00.000Z");
const matches = (row: any, where: any) => Object.entries(where).every(([field, value]) => row[field] === value);
const copy = <T>(row: T | undefined) => (row ? structuredClone(row) : null);

// In-memory Prisma boundary. Reads return copies so the service never observes later writes through
// shared references; `concurrently` runs a competing writer between the service's read and its conditional write.
function createStore() {
  const organizations = new Map<string, any>();
  const engagements = new Map<string, any>();
  const translations = new Map<string, any>();
  const writes: string[] = [];
  let pending: (() => void) | undefined;
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const translationKey = (engagementId: string, locale: Locale) => `${engagementId}:${locale}`;
  const racePoint = () => { const competingWriter = pending; pending = undefined; competingWriter?.(); };
  const write = (name: string) => { writes.push(name); racePoint(); };
  const store: any = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(store),
    clientOrganization: {
      create: async ({ data }: any) => {
        writes.push("clientOrganization.create");
        const row = { id: nextId("org"), logoReference: null, country: null, isActive: true, ...data };
        organizations.set(row.id, row);
        return copy(row);
      },
      findUnique: async ({ where }: any) => copy(organizations.get(where.id)),
      updateMany: async ({ where, data }: any) => {
        write("clientOrganization.updateMany");
        const row = organizations.get(where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    clientEngagement: {
      create: async ({ data }: any) => {
        writes.push("clientEngagement.create");
        const row = { id: nextId("engagement"), status: EngagementStatus.DRAFT, visibility: EngagementVisibility.PRIVATE, startDate: null, endDate: null, ...data };
        engagements.set(row.id, row);
        return copy(row);
      },
      findUnique: async ({ where }: any) => copy(engagements.get(where.id)),
      updateMany: async ({ where, data }: any) => {
        write("clientEngagement.updateMany");
        const row = engagements.get(where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }: any) => {
        write("clientEngagement.deleteMany");
        const row = engagements.get(where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        engagements.delete(where.id);
        return { count: 1 };
      },
    },
    clientEngagementTranslation: {
      createMany: async ({ data, skipDuplicates }: any) => {
        write("clientEngagementTranslation.createMany");
        const key = translationKey(data.clientEngagementId, data.locale);
        if (translations.has(key)) {
          if (skipDuplicates) return { count: 0 };
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        translations.set(key, { id: nextId("translation"), isPublished: false, ...data });
        return { count: 1 };
      },
      findUnique: async ({ where }: any) => {
        if (where.id) return copy([...translations.values()].find(row => row.id === where.id));
        const { clientEngagementId, locale } = where.clientEngagementId_locale;
        return copy(translations.get(translationKey(clientEngagementId, locale)));
      },
      updateMany: async ({ where, data }: any) => {
        write("clientEngagementTranslation.updateMany");
        const row = [...translations.values()].find(candidate => candidate.id === where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  return {
    store,
    organizations,
    engagements,
    writes,
    translation: (engagementId: string, locale: Locale) => translations.get(translationKey(engagementId, locale)),
    beforeNextWrite: (competingWriter: () => void) => (pending = competingWriter),
  };
}

function setup() {
  const fake = createStore();
  const service = createClientWorkService(fake.store as PrismaClient, () => TODAY);
  return { fake, service };
}

function expectCode(promise: Promise<unknown>, code: ClientWorkDomainError["code"]) {
  return expect(promise).rejects.toEqual(expect.objectContaining({ name: "ClientWorkDomainError", code }));
}

async function completedEngagement() {
  const { fake, service } = setup();
  const organization = await service.createClientOrganization({ name: "SONABEL", country: "BF" });
  const engagement = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.AUDIT, startDate: date("2026-01-10"), endDate: date("2026-01-20") });
  await service.completeClientEngagement(engagement.id);
  return { fake, service, organization, engagement: fake.engagements.get(engagement.id) };
}

describe("ClientOrganization service", () => {
  it("creates an active organization with normalized name, logo, and country", async () => {
    const { fake, service } = setup();
    const organization = await service.createClientOrganization({ name: "  ONEA  ", logoReference: "  logos/onea.png ", country: " bf " });
    expect(fake.organizations.get(organization.id)).toMatchObject({ name: "ONEA", logoReference: "logos/onea.png", country: "BF", isActive: true });
  });

  it("rejects a blank name on create and on update without persisting", async () => {
    const { fake, service } = setup();
    await expectCode(service.createClientOrganization({ name: "   " }), "INVALID_CLIENT_ORGANIZATION");
    expect(fake.organizations.size).toBe(0);
    const organization = await service.createClientOrganization({ name: "ONEA" });
    await expectCode(service.updateClientOrganization(organization.id, { name: "  " }), "INVALID_CLIENT_ORGANIZATION");
    expect(fake.organizations.get(organization.id).name).toBe("ONEA");
  });

  it("ordinary update cannot change isActive even when a runtime caller supplies it", async () => {
    const { fake, service } = setup();
    const organization = await service.createClientOrganization({ name: "ONEA" });
    const updated = await service.updateClientOrganization(organization.id, { name: " ONEA SA ", isActive: false } as any);
    expect(updated).toMatchObject({ name: "ONEA SA", isActive: true });
    await service.deactivateClientOrganization(organization.id);
    await service.updateClientOrganization(organization.id, { logoReference: "logo", isActive: true } as any);
    expect(fake.organizations.get(organization.id)).toMatchObject({ logoReference: "logo", isActive: false });
  });

  it("changes activity only through explicit deactivate/activate operations", async () => {
    const { fake, service } = setup();
    const organization = await service.createClientOrganization({ name: "ONEA" });
    expect(await service.deactivateClientOrganization(organization.id)).toMatchObject({ isActive: false });
    await expectCode(service.deactivateClientOrganization(organization.id), "STALE_CLIENT_ORGANIZATION_STATE");
    expect(await service.activateClientOrganization(organization.id)).toMatchObject({ isActive: true });
    await expectCode(service.activateClientOrganization(organization.id), "STALE_CLIENT_ORGANIZATION_STATE");
    expect(fake.organizations.get(organization.id).isActive).toBe(true);
    await expectCode(service.activateClientOrganization("missing"), "CLIENT_ORGANIZATION_NOT_FOUND");
  });

  it("rejects stale deactivation, activation, and update conditional writes", async () => {
    const { fake, service } = setup();
    const organization = await service.createClientOrganization({ name: "ONEA" });
    const row = fake.organizations.get(organization.id);

    fake.beforeNextWrite(() => (row.isActive = false));
    await expectCode(service.deactivateClientOrganization(organization.id), "STALE_CLIENT_ORGANIZATION_STATE");

    fake.beforeNextWrite(() => (row.isActive = true));
    await expectCode(service.activateClientOrganization(organization.id), "STALE_CLIENT_ORGANIZATION_STATE");

    fake.beforeNextWrite(() => (row.isActive = false));
    await expectCode(service.updateClientOrganization(organization.id, { name: "Renamed" }), "STALE_CLIENT_ORGANIZATION_STATE");
    expect(row.name).toBe("ONEA");
  });
});

describe("Historical preservation", () => {
  it("a COMPLETED engagement survives organization deactivation and reactivation unchanged", async () => {
    const { fake, service, organization, engagement } = await completedEngagement();
    await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: "Audit qualité" });
    await service.publishClientEngagementTranslation(engagement.id, Locale.FR);
    await service.makeClientEngagementPublic(engagement.id);
    const engagementBefore = structuredClone(fake.engagements.get(engagement.id));
    const translationBefore = structuredClone(fake.translation(engagement.id, Locale.FR));
    fake.writes.length = 0;

    await service.deactivateClientOrganization(organization.id);
    await service.activateClientOrganization(organization.id);
    await service.deactivateClientOrganization(organization.id);

    expect(fake.writes.every(name => name === "clientOrganization.updateMany")).toBe(true);
    expect(fake.organizations.has(organization.id)).toBe(true);
    expect(fake.engagements.get(engagement.id)).toEqual(engagementBefore);
    expect(fake.engagements.get(engagement.id)).toMatchObject({ status: EngagementStatus.COMPLETED, visibility: EngagementVisibility.PUBLIC, clientOrganizationId: organization.id });
    expect(fake.translation(engagement.id, Locale.FR)).toEqual(translationBefore);
  });
});

describe("ClientEngagement service", () => {
  describe("creation", () => {
    it("creates a DRAFT, PRIVATE engagement for an existing organization, with or without dates", async () => {
      const { fake, service } = setup();
      const organization = await service.createClientOrganization({ name: "ONEA" });
      const undated = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.CONSULTING });
      expect(fake.engagements.get(undated.id)).toMatchObject({ clientOrganizationId: organization.id, status: EngagementStatus.DRAFT, visibility: EngagementVisibility.PRIVATE, startDate: null, endDate: null });
      const dated = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.STUDY, startDate: date("2026-02-01") });
      expect(fake.engagements.get(dated.id)).toMatchObject({ status: EngagementStatus.DRAFT, startDate: date("2026-02-01"), endDate: null });
    });

    it("rejects a missing organization, an invalid type, or inverted dates without persisting", async () => {
      const { fake, service } = setup();
      await expectCode(service.createClientEngagement({ clientOrganizationId: "missing", type: EngagementType.AUDIT }), "CLIENT_ORGANIZATION_NOT_FOUND");
      const organization = await service.createClientOrganization({ name: "ONEA" });
      await expectCode(service.createClientEngagement({ clientOrganizationId: organization.id, type: "MARKETING" as EngagementType }), "INVALID_CLIENT_ENGAGEMENT");
      await expectCode(service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.AUDIT, startDate: date("2026-02-02"), endDate: date("2026-02-01") }), "INVALID_ENGAGEMENT_DATES");
      expect(fake.engagements.size).toBe(0);
    });
  });

  describe("completion", () => {
    async function draft(startDate: Date | null, endDate: Date | null) {
      const { fake, service } = setup();
      const organization = await service.createClientOrganization({ name: "ONEA" });
      const engagement = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.TRAINING, startDate, endDate });
      return { fake, service, id: engagement.id };
    }

    it("completes a DRAFT with concluded dates, including an engagement ending today", async () => {
      const past = await draft(date("2026-01-10"), date("2026-01-20"));
      expect(await past.service.completeClientEngagement(past.id)).toMatchObject({ status: EngagementStatus.COMPLETED, startDate: date("2026-01-10"), endDate: date("2026-01-20") });
      const endingToday = await draft(date("2026-06-01"), date("2026-06-15"));
      await endingToday.service.completeClientEngagement(endingToday.id);
      expect(endingToday.fake.engagements.get(endingToday.id).status).toBe(EngagementStatus.COMPLETED);
    });

    it.each([
      ["missing startDate", null, date("2026-01-20")],
      ["missing endDate", date("2026-01-10"), null],
      ["missing both dates", null, null],
      ["future endDate", date("2026-06-01"), date("2026-06-16")],
    ])("rejects completion with %s and leaves the engagement DRAFT", async (_label, startDate, endDate) => {
      const { fake, service, id } = await draft(startDate, endDate);
      await expectCode(service.completeClientEngagement(id), "INVALID_ENGAGEMENT_TRANSITION");
      expect(fake.engagements.get(id).status).toBe(EngagementStatus.DRAFT);
    });

    it("rejects completion when endDate precedes startDate, even for inconsistent stored data", async () => {
      const { fake, service, id } = await draft(null, null);
      await expectCode(service.updateClientEngagement(id, { startDate: date("2026-01-20"), endDate: date("2026-01-10") }), "INVALID_ENGAGEMENT_DATES");
      Object.assign(fake.engagements.get(id), { startDate: date("2026-01-20"), endDate: date("2026-01-10") });
      await expectCode(service.completeClientEngagement(id), "INVALID_ENGAGEMENT_DATES");
      expect(fake.engagements.get(id).status).toBe(EngagementStatus.DRAFT);
    });

    it("cannot complete an already COMPLETED engagement or a missing one", async () => {
      const { service, engagement } = await completedEngagement();
      await expectCode(service.completeClientEngagement(engagement.id), "INVALID_ENGAGEMENT_TRANSITION");
      await expectCode(service.completeClientEngagement("missing"), "CLIENT_ENGAGEMENT_NOT_FOUND");
    });

    it("rejects a stale completion when another writer completed the engagement first", async () => {
      const { fake, service, id } = await draft(date("2026-01-10"), date("2026-01-20"));
      fake.beforeNextWrite(() => (fake.engagements.get(id).status = EngagementStatus.COMPLETED));
      await expectCode(service.completeClientEngagement(id), "STALE_CLIENT_ENGAGEMENT_STATE");
    });

    it("rejects a stale DRAFT update when the engagement was completed concurrently", async () => {
      const { fake, service, id } = await draft(date("2026-01-10"), date("2026-01-20"));
      fake.beforeNextWrite(() => (fake.engagements.get(id).status = EngagementStatus.COMPLETED));
      await expectCode(service.updateClientEngagement(id, { endDate: date("2026-01-25") }), "STALE_CLIENT_ENGAGEMENT_STATE");
      expect(fake.engagements.get(id).endDate).toEqual(date("2026-01-20"));
    });
  });

  describe("historical immutability", () => {
    it.each([
      ["clientOrganizationId", (organizationId: string) => ({ clientOrganizationId: organizationId })],
      ["type", () => ({ type: EngagementType.CONSULTING })],
      ["startDate", () => ({ startDate: date("2026-01-01") })],
      ["endDate", () => ({ endDate: date("2026-01-31") })],
      ["startDate cleared", () => ({ startDate: null })],
      ["endDate cleared", () => ({ endDate: null })],
    ])("ordinary update cannot change %s of a COMPLETED engagement", async (_field, change) => {
      const { fake, service, engagement } = await completedEngagement();
      const other = await service.createClientOrganization({ name: "Other" });
      const before = structuredClone(fake.engagements.get(engagement.id));
      await expectCode(service.updateClientEngagement(engagement.id, change(other.id) as any), "ENGAGEMENT_IMMUTABLE");
      expect(fake.engagements.get(engagement.id)).toEqual(before);
    });

    it("ignores lifecycle fields smuggled into an ordinary update", async () => {
      const { fake, service, engagement } = await completedEngagement();
      const before = structuredClone(fake.engagements.get(engagement.id));
      await service.updateClientEngagement(engagement.id, { status: EngagementStatus.DRAFT, visibility: EngagementVisibility.PUBLIC, id: "hijack" } as any);
      expect(fake.engagements.get(engagement.id)).toEqual(before);

      const organization = await service.createClientOrganization({ name: "ONEA" });
      const draftEngagement = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.AUDIT });
      await service.updateClientEngagement(draftEngagement.id, { status: EngagementStatus.COMPLETED, startDate: date("2026-01-01") } as any);
      expect(fake.engagements.get(draftEngagement.id)).toMatchObject({ status: EngagementStatus.DRAFT, startDate: date("2026-01-01") });
    });

    it("permits DRAFT fact edits, verifying a reassigned organization exists", async () => {
      const { fake, service } = setup();
      const organization = await service.createClientOrganization({ name: "ONEA" });
      const other = await service.createClientOrganization({ name: "SONABEL" });
      const engagement = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.AUDIT });
      await service.updateClientEngagement(engagement.id, { clientOrganizationId: other.id, type: EngagementType.STUDY, startDate: date("2026-01-01"), endDate: date("2026-01-02") });
      expect(fake.engagements.get(engagement.id)).toMatchObject({ clientOrganizationId: other.id, type: EngagementType.STUDY, endDate: date("2026-01-02") });
      await expectCode(service.updateClientEngagement(engagement.id, { clientOrganizationId: "missing" }), "CLIENT_ORGANIZATION_NOT_FOUND");
      expect(fake.engagements.get(engagement.id).clientOrganizationId).toBe(other.id);
    });
  });

  describe("mutable presentation after completion", () => {
    it("toggles visibility PRIVATE → PUBLIC → PRIVATE without altering historical facts", async () => {
      const { fake, service, engagement } = await completedEngagement();
      const facts = (row: any) => ({ clientOrganizationId: row.clientOrganizationId, type: row.type, status: row.status, startDate: row.startDate, endDate: row.endDate });
      const before = facts(fake.engagements.get(engagement.id));
      expect(await service.makeClientEngagementPublic(engagement.id)).toMatchObject({ visibility: EngagementVisibility.PUBLIC });
      expect(facts(fake.engagements.get(engagement.id))).toEqual(before);
      expect(await service.makeClientEngagementPrivate(engagement.id)).toMatchObject({ visibility: EngagementVisibility.PRIVATE });
      expect(facts(fake.engagements.get(engagement.id))).toEqual(before);
    });

    it("edits, publishes, and unpublishes translations without altering historical facts", async () => {
      const { fake, service, engagement } = await completedEngagement();
      const before = structuredClone(fake.engagements.get(engagement.id));
      await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: "  Audit  ", description: "  " });
      expect(fake.translation(engagement.id, Locale.FR)).toMatchObject({ title: "Audit", description: null, isPublished: false });
      await service.publishClientEngagementTranslation(engagement.id, Locale.FR);
      await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: "Audit qualité", description: "Revue ISO" });
      expect(fake.translation(engagement.id, Locale.FR)).toMatchObject({ title: "Audit qualité", description: "Revue ISO", isPublished: true });
      await service.unpublishClientEngagementTranslation(engagement.id, Locale.FR);
      expect(fake.translation(engagement.id, Locale.FR).isPublished).toBe(false);
      expect(fake.translation(engagement.id, Locale.EN)).toBeUndefined();
      expect(fake.engagements.get(engagement.id)).toEqual(before);
    });

    it("requires a title to publish and refuses to blank the title of a published translation", async () => {
      const { fake, service, engagement } = await completedEngagement();
      await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.PT, title: "  " });
      await expectCode(service.publishClientEngagementTranslation(engagement.id, Locale.PT), "INVALID_ENGAGEMENT_TRANSLATION");
      await expectCode(service.publishClientEngagementTranslation(engagement.id, Locale.EN), "ENGAGEMENT_TRANSLATION_NOT_FOUND");
      await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.PT, title: "Auditoria" });
      await service.publishClientEngagementTranslation(engagement.id, Locale.PT);
      await expectCode(service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.PT, title: "   " }), "INVALID_ENGAGEMENT_TRANSLATION");
      expect(fake.translation(engagement.id, Locale.PT)).toMatchObject({ title: "Auditoria", isPublished: true });
    });

    it("rejects a stale translation publication", async () => {
      const { fake, service, engagement } = await completedEngagement();
      await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: "Audit" });
      fake.beforeNextWrite(() => (fake.translation(engagement.id, Locale.FR).isPublished = true));
      await expectCode(service.publishClientEngagementTranslation(engagement.id, Locale.FR), "STALE_CLIENT_ENGAGEMENT_STATE");
    });
  });

  describe("deletion", () => {
    it("deletes a DRAFT engagement but never its organization", async () => {
      const { fake, service } = setup();
      const organization = await service.createClientOrganization({ name: "ONEA" });
      const engagement = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.AUDIT });
      await service.deleteClientEngagementDraft(engagement.id);
      expect(fake.engagements.has(engagement.id)).toBe(false);
      expect(fake.organizations.get(organization.id)).toMatchObject({ name: "ONEA", isActive: true });
      expect(fake.writes.filter(name => name.startsWith("clientOrganization.") && name !== "clientOrganization.create")).toEqual([]);
      await expectCode(service.deleteClientEngagementDraft(engagement.id), "CLIENT_ENGAGEMENT_NOT_FOUND");
    });

    it("refuses to delete a COMPLETED engagement as immutable history", async () => {
      const { fake, service, organization, engagement } = await completedEngagement();
      await expectCode(service.deleteClientEngagementDraft(engagement.id), "ENGAGEMENT_IMMUTABLE");
      expect(fake.engagements.get(engagement.id).status).toBe(EngagementStatus.COMPLETED);
      expect(fake.organizations.has(organization.id)).toBe(true);
    });

    it("a concurrent DRAFT → COMPLETED defeats a stale draft deletion", async () => {
      const { fake, service } = setup();
      const organization = await service.createClientOrganization({ name: "ONEA" });
      const engagement = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.AUDIT, startDate: date("2026-01-10"), endDate: date("2026-01-20") });
      fake.beforeNextWrite(() => (fake.engagements.get(engagement.id).status = EngagementStatus.COMPLETED));
      await expectCode(service.deleteClientEngagementDraft(engagement.id), "STALE_CLIENT_ENGAGEMENT_STATE");
      expect(fake.engagements.get(engagement.id).status).toBe(EngagementStatus.COMPLETED);
      expect(fake.organizations.has(organization.id)).toBe(true);
    });
  });

  describe("4B boundary gaps", () => {
    it.each(["makeClientEngagementPublic", "makeClientEngagementPrivate"] as const)("%s on a missing engagement fails with CLIENT_ENGAGEMENT_NOT_FOUND", async operation => {
      const { fake, service } = setup();
      const promise = service[operation]("missing");
      await expectCode(promise, "CLIENT_ENGAGEMENT_NOT_FOUND");
      await expect(promise).rejects.not.toHaveProperty("code", "P2025");
      expect(fake.writes).toEqual([]);
    });

    it.each(["makeClientEngagementPublic", "makeClientEngagementPrivate"] as const)("%s on an engagement deleted between read and write is stale, not NOT_FOUND", async operation => {
      const { fake, service } = setup();
      const organization = await service.createClientOrganization({ name: "ONEA" });
      const engagement = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.AUDIT });
      fake.beforeNextWrite(() => fake.engagements.delete(engagement.id));
      await expectCode(service[operation](engagement.id), "STALE_CLIENT_ENGAGEMENT_STATE");
    });

    it("visibility change is not spuriously stale when the engagement is completed concurrently", async () => {
      const { fake, service } = setup();
      const organization = await service.createClientOrganization({ name: "ONEA" });
      const engagement = await service.createClientEngagement({ clientOrganizationId: organization.id, type: EngagementType.AUDIT, startDate: date("2026-01-10"), endDate: date("2026-01-20") });
      fake.beforeNextWrite(() => (fake.engagements.get(engagement.id).status = EngagementStatus.COMPLETED));
      expect(await service.makeClientEngagementPublic(engagement.id)).toMatchObject({ status: EngagementStatus.COMPLETED, visibility: EngagementVisibility.PUBLIC });
    });

    it("a blank-title edit loses to a translation published between its read and write", async () => {
      const { fake, service, engagement } = await completedEngagement();
      await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: "Audit qualité", description: "Revue" });
      fake.beforeNextWrite(() => (fake.translation(engagement.id, Locale.FR).isPublished = true));
      await expectCode(service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: "   " }), "STALE_CLIENT_ENGAGEMENT_STATE");
      expect(fake.translation(engagement.id, Locale.FR)).toMatchObject({ isPublished: true, title: "Audit qualité", description: "Revue" });
    });

    it("a valid edit still succeeds against a concurrently published translation", async () => {
      const { fake, service, engagement } = await completedEngagement();
      await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: "Audit" });
      fake.beforeNextWrite(() => (fake.translation(engagement.id, Locale.FR).isPublished = true));
      await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: "Audit qualité" });
      expect(fake.translation(engagement.id, Locale.FR)).toMatchObject({ isPublished: true, title: "Audit qualité" });
    });

    it("a publication validated against a stale title loses when the title was blanked between its read and write", async () => {
      const { fake, service, engagement } = await completedEngagement();
      await service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: "Audit" });
      fake.beforeNextWrite(() => (fake.translation(engagement.id, Locale.FR).title = ""));
      await expectCode(service.publishClientEngagementTranslation(engagement.id, Locale.FR), "STALE_CLIENT_ENGAGEMENT_STATE");
      expect(fake.translation(engagement.id, Locale.FR)).toMatchObject({ isPublished: false, title: "" });
    });

    it("a first-time create racing a concurrent create-and-publish fails and leaves the winner intact", async () => {
      const { fake, service, engagement } = await completedEngagement();
      fake.beforeNextWrite(() => {
        void fake.store.clientEngagementTranslation.createMany({ data: { clientEngagementId: engagement.id, locale: Locale.FR, title: "Audit", description: null } });
        fake.translation(engagement.id, Locale.FR).isPublished = true;
      });
      await expectCode(service.upsertClientEngagementTranslation(engagement.id, { locale: Locale.FR, title: " " }), "STALE_CLIENT_ENGAGEMENT_STATE");
      expect(fake.translation(engagement.id, Locale.FR)).toMatchObject({ isPublished: true, title: "Audit" });
    });
  });
});
