import "server-only";

import { CatalogueStatus, Locale, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CatalogueDomainError, type CatalogueErrorCode } from "./catalogue.errors";
import { assertLocale, assertTranslation, normalizeSlug } from "./catalogue.validation";

const transitions: Record<CatalogueStatus, CatalogueStatus[]> = {
  DRAFT: [CatalogueStatus.PUBLISHED, CatalogueStatus.ARCHIVED],
  PUBLISHED: [CatalogueStatus.ARCHIVED],
  ARCHIVED: [CatalogueStatus.PUBLISHED],
};
function fail(code: CatalogueErrorCode, message: string): never { throw new CatalogueDomainError(code, message); }
const isPrismaCode = (error: unknown, code: string) => typeof error === "object" && error !== null && "code" in error && error.code === code;

export type DomainTranslationInput = { locale: Locale; name: string; slug: string };
export type TopicTranslationInput = DomainTranslationInput;
export type TrainingTranslationInput = { locale: Locale; title: string; slug: string; summary?: string | null; description?: string | null; objectives?: string | null; targetAudience?: string | null; program?: string | null };

export function createCatalogueService(client: PrismaClient) {
  async function requireDomain(tx: Prisma.TransactionClient, id: string) { const entity = await tx.trainingDomain.findUnique({ where: { id } }); return entity ?? fail("DOMAIN_NOT_FOUND", "Training domain was not found."); }
  async function requireTopic(tx: Prisma.TransactionClient, id: string) { const entity = await tx.trainingTopic.findUnique({ where: { id } }); return entity ?? fail("TOPIC_NOT_FOUND", "Training topic was not found."); }
  async function requireTraining(tx: Prisma.TransactionClient, id: string) { const entity = await tx.training.findUnique({ where: { id } }); return entity ?? fail("TRAINING_NOT_FOUND", "Training was not found."); }
  function allowed(current: CatalogueStatus, target: CatalogueStatus) { if (!transitions[current].includes(target)) fail("INVALID_CATALOGUE_TRANSITION", `Cannot transition ${current} to ${target}.`); }
  async function transitionDomain(id: string, target: CatalogueStatus) { return client.$transaction(async tx => { const d = await requireDomain(tx, id); allowed(d.status, target); const r = await tx.trainingDomain.updateMany({ where: { id, status: d.status }, data: { status: target } }); if (r.count !== 1) fail("STALE_CATALOGUE_STATE", "Domain changed concurrently."); return requireDomain(tx, id); }); }
  async function transitionTopic(id: string, target: CatalogueStatus) { return client.$transaction(async tx => { const t = await requireTopic(tx, id); allowed(t.status, target); const r = await tx.trainingTopic.updateMany({ where: { id, status: t.status }, data: { status: target } }); if (r.count !== 1) fail("STALE_CATALOGUE_STATE", "Topic changed concurrently."); return requireTopic(tx, id); }); }
  async function transitionTraining(id: string, target: CatalogueStatus) { return client.$transaction(async tx => { const t = await requireTraining(tx, id); allowed(t.status, target); const r = await tx.training.updateMany({ where: { id, status: t.status }, data: { status: target } }); if (r.count !== 1) fail("STALE_CATALOGUE_STATE", "Training changed concurrently."); return requireTraining(tx, id); }); }

  async function upsertDomainTranslation(domainId: string, input: DomainTranslationInput) {
    assertLocale(input.locale); const data = { name: input.name.trim(), slug: normalizeSlug(input.slug) };
    return client.$transaction(async tx => { await requireDomain(tx, domainId); try { return await tx.trainingDomainTranslation.upsert({ where: { trainingDomainId_locale: { trainingDomainId: domainId, locale: input.locale } }, create: { trainingDomainId: domainId, locale: input.locale, ...data }, update: data }); } catch (e) { if (isPrismaCode(e, "P2002")) fail("SLUG_CONFLICT", "Domain slug already exists for this locale."); throw e; } });
  }
  async function upsertTopicTranslation(topicId: string, input: TopicTranslationInput) {
    assertLocale(input.locale); const data = { name: input.name.trim(), slug: normalizeSlug(input.slug) };
    return client.$transaction(async tx => { await requireTopic(tx, topicId); try { return await tx.trainingTopicTranslation.upsert({ where: { trainingTopicId_locale: { trainingTopicId: topicId, locale: input.locale } }, create: { trainingTopicId: topicId, locale: input.locale, ...data }, update: data }); } catch (e) { if (isPrismaCode(e, "P2002")) fail("SLUG_CONFLICT", "Topic slug already exists for this locale."); throw e; } });
  }
  async function upsertTrainingTranslation(trainingId: string, input: TrainingTranslationInput) {
    assertLocale(input.locale); const data = { title: input.title.trim(), slug: normalizeSlug(input.slug), summary: input.summary, description: input.description, objectives: input.objectives, targetAudience: input.targetAudience, program: input.program };
    return client.$transaction(async tx => { await requireTraining(tx, trainingId); try { return await tx.trainingTranslation.upsert({ where: { trainingId_locale: { trainingId, locale: input.locale } }, create: { trainingId, locale: input.locale, ...data }, update: data }); } catch (e) { if (isPrismaCode(e, "P2002")) fail("SLUG_CONFLICT", "Training slug already exists for this locale."); throw e; } });
  }
  async function publishTranslation(kind: "domain" | "topic" | "training", id: string, locale: Locale, published: boolean) {
    assertLocale(locale);
    return client.$transaction(async tx => {
      if (kind === "domain") {
        const translation = await tx.trainingDomainTranslation.findUnique({ where: { trainingDomainId_locale: { trainingDomainId: id, locale } } });
        if (!translation) fail("TRANSLATION_NOT_FOUND", "Translation was not found.");
        if (published) { assertTranslation(translation.name, "Translation name"); assertTranslation(translation.slug, "Slug"); }
        const r = await tx.trainingDomainTranslation.updateMany({ where: { id: translation.id, isPublished: !published }, data: { isPublished: published } });
        if (r.count !== 1 && translation.isPublished !== published) fail("STALE_CATALOGUE_STATE", "Translation changed concurrently.");
        return tx.trainingDomainTranslation.findUnique({ where: { id: translation.id } });
      }
      if (kind === "topic") {
        const translation = await tx.trainingTopicTranslation.findUnique({ where: { trainingTopicId_locale: { trainingTopicId: id, locale } } });
        if (!translation) fail("TRANSLATION_NOT_FOUND", "Translation was not found.");
        if (published) { assertTranslation(translation.name, "Translation name"); assertTranslation(translation.slug, "Slug"); }
        const r = await tx.trainingTopicTranslation.updateMany({ where: { id: translation.id, isPublished: !published }, data: { isPublished: published } });
        if (r.count !== 1 && translation.isPublished !== published) fail("STALE_CATALOGUE_STATE", "Translation changed concurrently.");
        return tx.trainingTopicTranslation.findUnique({ where: { id: translation.id } });
      }
      const translation = await tx.trainingTranslation.findUnique({ where: { trainingId_locale: { trainingId: id, locale } } });
      if (!translation) fail("TRANSLATION_NOT_FOUND", "Translation was not found.");
      if (published) { assertTranslation(translation.title, "Translation title"); assertTranslation(translation.slug, "Slug"); }
      const r = await tx.trainingTranslation.updateMany({ where: { id: translation.id, isPublished: !published }, data: { isPublished: published } });
      if (r.count !== 1 && translation.isPublished !== published) fail("STALE_CATALOGUE_STATE", "Translation changed concurrently.");
      return tx.trainingTranslation.findUnique({ where: { id: translation.id } });
    });
  }

  return {
    createTrainingDomain: (displayOrder = 0) => client.trainingDomain.create({ data: { displayOrder } }),
    async updateTrainingDomain(id: string, input: { displayOrder?: number }) { await requireDomain(client as Prisma.TransactionClient, id); return client.trainingDomain.update({ where: { id }, data: input }); },
    async deleteTrainingDomainDraft(id: string) { return client.$transaction(async tx => { const d = await requireDomain(tx, id); if (d.status !== CatalogueStatus.DRAFT) fail("CATALOGUE_ENTITY_ESTABLISHED", "Established domains must be archived."); if (await tx.trainingTopic.count({ where: { trainingDomainId: id } })) fail("CATALOGUE_ENTITY_HAS_DEPENDENCIES", "Domain has topics."); const r = await tx.trainingDomain.deleteMany({ where: { id, status: CatalogueStatus.DRAFT } }); if (!r.count) fail("STALE_CATALOGUE_STATE", "Domain changed concurrently."); }); },
    publishTrainingDomain: (id: string) => transitionDomain(id, CatalogueStatus.PUBLISHED), archiveTrainingDomain: (id: string) => transitionDomain(id, CatalogueStatus.ARCHIVED),
    async createTrainingTopic(trainingDomainId: string, displayOrder = 0) { return client.$transaction(async tx => { await requireDomain(tx, trainingDomainId); return tx.trainingTopic.create({ data: { trainingDomainId, displayOrder } }); }); },
    async updateTrainingTopic(id: string, input: { displayOrder?: number }) { await requireTopic(client as Prisma.TransactionClient, id); return client.trainingTopic.update({ where: { id }, data: input }); },
    async moveTrainingTopic(id: string, trainingDomainId: string) { return client.$transaction(async tx => { const topic = await requireTopic(tx, id); await requireDomain(tx, trainingDomainId); const r = await tx.trainingTopic.updateMany({ where: { id, trainingDomainId: topic.trainingDomainId }, data: { trainingDomainId } }); if (!r.count) fail("STALE_CATALOGUE_STATE", "Topic changed concurrently."); return requireTopic(tx, id); }); },
    async deleteTrainingTopicDraft(id: string) { return client.$transaction(async tx => { const t = await requireTopic(tx, id); if (t.status !== CatalogueStatus.DRAFT) fail("CATALOGUE_ENTITY_ESTABLISHED", "Established topics must be archived."); if (await tx.training.count({ where: { trainingTopicId: id } })) fail("CATALOGUE_ENTITY_HAS_DEPENDENCIES", "Topic has trainings."); const r = await tx.trainingTopic.deleteMany({ where: { id, status: CatalogueStatus.DRAFT } }); if (!r.count) fail("STALE_CATALOGUE_STATE", "Topic changed concurrently."); }); },
    publishTrainingTopic: (id: string) => transitionTopic(id, CatalogueStatus.PUBLISHED), archiveTrainingTopic: (id: string) => transitionTopic(id, CatalogueStatus.ARCHIVED),
    async createTraining(trainingTopicId: string) { return client.$transaction(async tx => { await requireTopic(tx, trainingTopicId); return tx.training.create({ data: { trainingTopicId } }); }); },
    async updateTraining(id: string) { await requireTraining(client as Prisma.TransactionClient, id); return client.training.update({ where: { id }, data: {} }); },
    async moveTraining(id: string, trainingTopicId: string) { return client.$transaction(async tx => { const training = await requireTraining(tx, id); await requireTopic(tx, trainingTopicId); const r = await tx.training.updateMany({ where: { id, trainingTopicId: training.trainingTopicId }, data: { trainingTopicId } }); if (!r.count) fail("STALE_CATALOGUE_STATE", "Training changed concurrently."); return requireTraining(tx, id); }); },
    async deleteTrainingDraft(id: string) { return client.$transaction(async tx => { const t = await requireTraining(tx, id); if (t.status !== CatalogueStatus.DRAFT) fail("CATALOGUE_ENTITY_ESTABLISHED", "Established trainings must be archived."); if (await tx.trainingSession.count({ where: { trainingId: id } })) fail("CATALOGUE_ENTITY_HAS_DEPENDENCIES", "Training has sessions."); const r = await tx.training.deleteMany({ where: { id, status: CatalogueStatus.DRAFT } }); if (!r.count) fail("STALE_CATALOGUE_STATE", "Training changed concurrently."); }); },
    publishTraining: (id: string) => transitionTraining(id, CatalogueStatus.PUBLISHED), archiveTraining: (id: string) => transitionTraining(id, CatalogueStatus.ARCHIVED),
    upsertTrainingDomainTranslation: upsertDomainTranslation, upsertTrainingTopicTranslation: upsertTopicTranslation, upsertTrainingTranslation,
    publishTrainingDomainTranslation: (id: string, locale: Locale) => publishTranslation("domain", id, locale, true), unpublishTrainingDomainTranslation: (id: string, locale: Locale) => publishTranslation("domain", id, locale, false),
    publishTrainingTopicTranslation: (id: string, locale: Locale) => publishTranslation("topic", id, locale, true), unpublishTrainingTopicTranslation: (id: string, locale: Locale) => publishTranslation("topic", id, locale, false),
    publishTrainingTranslation: (id: string, locale: Locale) => publishTranslation("training", id, locale, true), unpublishTrainingTranslation: (id: string, locale: Locale) => publishTranslation("training", id, locale, false),
  };
}
export const catalogueService = createCatalogueService(prisma);
