import "server-only";

import { ExpertStatus, Locale, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ExpertDomainError, type ExpertErrorCode } from "./expert.errors";
import { assertExpertLocale, normalizeDisplayOrder, normalizeExpertName, normalizeOptionalText } from "./expert.validation";

function fail(code: ExpertErrorCode, message: string): never { throw new ExpertDomainError(code, message); }

export type ExpertInput = { name: string; portraitReference?: string | null; displayOrder?: number };
export type UpdateExpertInput = { name?: string; portraitReference?: string | null; displayOrder?: number };
export type ExpertTranslationInput = { locale: Locale; professionalTitle?: string | null; specialization?: string | null; biography?: string | null };

export function createExpertService(client: PrismaClient) {
  const normalizedProfile = (input: ExpertInput) => ({ name: normalizeExpertName(input.name), displayOrder: normalizeDisplayOrder(input.displayOrder ?? 0), portraitReference: normalizeOptionalText(input.portraitReference) });
  const normalizedTranslation = (input: ExpertTranslationInput) => {
    assertExpertLocale(input.locale);
    return { professionalTitle: normalizeOptionalText(input.professionalTitle), specialization: normalizeOptionalText(input.specialization), biography: normalizeOptionalText(input.biography) };
  };
  async function requireExpert(tx: Prisma.TransactionClient, id: string) {
    const expert = await tx.expert.findUnique({ where: { id } });
    if (!expert) fail("EXPERT_NOT_FOUND", "Expert was not found.");
    return expert;
  }
  async function transition(id: string, target: ExpertStatus) {
    return client.$transaction(async tx => {
      const expert = await requireExpert(tx, id);
      if (expert.status === target) fail("INVALID_EXPERT_TRANSITION", `Expert is already ${target}.`);
      const result = await tx.expert.updateMany({ where: { id, status: expert.status }, data: { status: target } });
      if (result.count !== 1) fail("STALE_EXPERT_STATE", "Expert lifecycle changed concurrently.");
      return requireExpert(tx, id);
    });
  }
  return {
    createExpert(input: ExpertInput) {
      return client.expert.create({ data: normalizedProfile(input) });
    },
    async createExpertWithTranslation(input: ExpertInput, translation: ExpertTranslationInput) {
      const profile = normalizedProfile(input);
      const presentation = normalizedTranslation(translation);
      return client.$transaction(async tx => {
        const expert = await tx.expert.create({ data: profile });
        await tx.expertTranslation.create({ data: { expertId: expert.id, locale: translation.locale, ...presentation } });
        return expert;
      });
    },
    async updateExpert(id: string, input: UpdateExpertInput) {
      return client.$transaction(async tx => {
        const expert = await requireExpert(tx, id);
        const data = {
          name: input.name === undefined ? expert.name : normalizeExpertName(input.name),
          displayOrder: input.displayOrder === undefined ? expert.displayOrder : normalizeDisplayOrder(input.displayOrder),
          portraitReference: input.portraitReference === undefined ? expert.portraitReference : normalizeOptionalText(input.portraitReference),
        };
        const result = await tx.expert.updateMany({ where: { id, status: expert.status }, data });
        if (result.count !== 1) fail("STALE_EXPERT_STATE", "Expert lifecycle changed concurrently.");
        return requireExpert(tx, id);
      });
    },
    activateExpert: (id: string) => transition(id, ExpertStatus.ACTIVE),
    deactivateExpert: (id: string) => transition(id, ExpertStatus.INACTIVE),
    async upsertExpertTranslation(expertId: string, input: ExpertTranslationInput) {
      const data = normalizedTranslation(input);
      return client.$transaction(async tx => { await requireExpert(tx, expertId); return tx.expertTranslation.upsert({ where: { expertId_locale: { expertId, locale: input.locale } }, create: { expertId, locale: input.locale, ...data }, update: data }); });
    },
    async publishExpertTranslation(expertId: string, locale: Locale) {
      assertExpertLocale(locale);
      return client.$transaction(async tx => {
        const translation = await tx.expertTranslation.findUnique({ where: { expertId_locale: { expertId, locale } } });
        if (!translation) fail("EXPERT_TRANSLATION_NOT_FOUND", "Expert translation was not found.");
        if (!translation.professionalTitle?.trim()) fail("INVALID_EXPERT_TRANSLATION", "A professional title is required for public visibility.");
        const result = await tx.expertTranslation.updateMany({ where: { id: translation.id, isPublished: false }, data: { isPublished: true } });
        if (result.count !== 1 && !translation.isPublished) fail("STALE_EXPERT_STATE", "Expert translation changed concurrently.");
        return tx.expertTranslation.findUnique({ where: { id: translation.id } });
      });
    },
    async unpublishExpertTranslation(expertId: string, locale: Locale) {
      assertExpertLocale(locale);
      return client.$transaction(async tx => {
        const translation = await tx.expertTranslation.findUnique({ where: { expertId_locale: { expertId, locale } } });
        if (!translation) fail("EXPERT_TRANSLATION_NOT_FOUND", "Expert translation was not found.");
        const result = await tx.expertTranslation.updateMany({ where: { id: translation.id, isPublished: true }, data: { isPublished: false } });
        if (result.count !== 1 && translation.isPublished) fail("STALE_EXPERT_STATE", "Expert translation changed concurrently.");
        return tx.expertTranslation.findUnique({ where: { id: translation.id } });
      });
    },
  };
}
export const expertService = createExpertService(prisma);
