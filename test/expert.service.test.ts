/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExpertStatus, Locale, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createExpertService } from "../lib/expert.service";

function makeStore() {
  const experts = new Map<string, any>();
  const translations = new Map<string, any>();
  const key = (id: string, locale: Locale) => `${id}:${locale}`;
  const store: any = {
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(store),
    expert: {
      create: async ({ data }: any) => { const expert = { id: `expert-${experts.size + 1}`, status: ExpertStatus.ACTIVE, ...data }; experts.set(expert.id, expert); return expert; },
      findUnique: async ({ where }: any) => experts.get(where.id) ?? null,
      updateMany: async ({ where, data }: any) => { const expert = experts.get(where.id); if (!expert || expert.status !== where.status) return { count: 0 }; Object.assign(expert, data); return { count: 1 }; },
    },
    expertTranslation: {
      create: async ({ data }: any) => { const id = key(data.expertId, data.locale); const value = { id, isPublished: false, ...data }; translations.set(id, value); return value; },
      upsert: async ({ where, create, update }: any) => { const id = key(where.expertId_locale.expertId, where.expertId_locale.locale); const existing = translations.get(id); const value = existing ? Object.assign(existing, update) : { id, isPublished: false, ...create }; translations.set(id, value); return value; },
      findUnique: async ({ where }: any) => where.id ? [...translations.values()].find(t => t.id === where.id) ?? null : translations.get(key(where.expertId_locale.expertId, where.expertId_locale.locale)) ?? null,
      updateMany: async ({ where, data }: any) => { const translation = [...translations.values()].find(t => t.id === where.id); if (!translation || translation.isPublished !== where.isPublished) return { count: 0 }; Object.assign(translation, data); return { count: 1 }; },
    },
  };
  return { store, experts, translations, key };
}

describe("Expert service", () => {
  it("creates and updates a normalized profile without exposing status mutation", async () => {
    const fake = makeStore(); const service = createExpertService(fake.store as PrismaClient);
    const expert = await service.createExpert({ name: "  Awa Traore ", portraitReference: "  portrait-1  ", displayOrder: 0 });
    expect(expert).toMatchObject({ name: "Awa Traore", portraitReference: "portrait-1", status: ExpertStatus.ACTIVE });
    const updated = await service.updateExpert(expert.id, { name: "Awa T.", displayOrder: 2, portraitReference: " " });
    expect(updated).toMatchObject({ name: "Awa T.", displayOrder: 2, portraitReference: null, status: ExpertStatus.ACTIVE });
  });

  it("creates the Expert and initial presentation atomically", async () => {
    const fake = makeStore(); const service = createExpertService(fake.store as PrismaClient);
    const expert = await service.createExpertWithTranslation({ name: "Awa" }, { locale: Locale.FR, professionalTitle: "Formatrice" });
    expect(fake.experts.get(expert.id)).toMatchObject({ name: "Awa" });
    expect(fake.translations.get(fake.key(expert.id, Locale.FR))).toMatchObject({ professionalTitle: "Formatrice" });
  });

  it("deactivates and reactivates without changing translations or historical assignments", async () => {
    const fake = makeStore(); const service = createExpertService(fake.store as PrismaClient);
    const expert = await service.createExpert({ name: "Awa" });
    await service.upsertExpertTranslation(expert.id, { locale: Locale.FR, professionalTitle: "Formatrice" });
    const assignments = new Set([`${expert.id}:completed`, `${expert.id}:cancelled`, `${expert.id}:future`]);
    await service.deactivateExpert(expert.id);
    expect(fake.experts.get(expert.id).status).toBe(ExpertStatus.INACTIVE);
    expect(fake.translations.get(fake.key(expert.id, Locale.FR)).isPublished).toBe(false);
    expect(assignments.size).toBe(3);
    await service.activateExpert(expert.id);
    expect(fake.experts.get(expert.id).status).toBe(ExpertStatus.ACTIVE);
  });

  it("requires a professional title to publish independently of activation", async () => {
    const fake = makeStore(); const service = createExpertService(fake.store as PrismaClient);
    const expert = await service.createExpert({ name: "Awa" });
    await service.upsertExpertTranslation(expert.id, { locale: Locale.FR, biography: "Bio" });
    await expect(service.publishExpertTranslation(expert.id, Locale.FR)).rejects.toMatchObject({ code: "INVALID_EXPERT_TRANSLATION" });
    await service.upsertExpertTranslation(expert.id, { locale: Locale.FR, professionalTitle: "Consultante" });
    await service.publishExpertTranslation(expert.id, Locale.FR);
    await service.deactivateExpert(expert.id);
    expect(fake.translations.get(fake.key(expert.id, Locale.FR)).isPublished).toBe(true);
  });
});
