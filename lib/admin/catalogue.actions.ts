"use server";

import { Locale } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { CatalogueDomainError } from "@/lib/catalogue.errors";
import { catalogueService } from "@/lib/catalogue.service";

export type CatalogueActionState = { error?: string };
const value = (data: FormData, key: string) => typeof data.get(key) === "string" ? String(data.get(key)).trim() : "";
const optional = (data: FormData, key: string) => value(data, key) || null;
const order = (data: FormData) => Number.parseInt(value(data, "displayOrder") || "0", 10) || 0;
const locale = (data: FormData) => {
  const candidate = value(data, "locale");
  return candidate === Locale.FR || candidate === Locale.EN || candidate === Locale.PT ? candidate : null;
};
const adminError = (error: unknown) => {
  if (!(error instanceof CatalogueDomainError)) return "Une erreur technique est survenue. Réessayez dans un instant.";
  const messages: Record<CatalogueDomainError["code"], string> = {
    DOMAIN_NOT_FOUND: "Ce domaine n’existe plus.", TOPIC_NOT_FOUND: "Cette thématique n’existe plus.", TRAINING_NOT_FOUND: "Cette formation n’existe plus.", TRANSLATION_NOT_FOUND: "Cette traduction n’existe pas encore.",
    INVALID_CATALOGUE_TRANSITION: "Cette transition d’état n’est pas autorisée.", CATALOGUE_ENTITY_ESTABLISHED: "Cet élément établi doit être archivé, pas supprimé.", CATALOGUE_ENTITY_HAS_DEPENDENCIES: "Cet élément est encore utilisé et ne peut pas être supprimé.",
    INVALID_LOCALE: "La langue sélectionnée n’est pas prise en charge.", INVALID_TRANSLATION: "Les informations requises pour publier cette traduction sont incomplètes.", INVALID_SLUG: "Le slug doit contenir des caractères URL valides.", SLUG_CONFLICT: "Ce slug est déjà utilisé dans cette langue.", STALE_CATALOGUE_STATE: "Cet élément a été modifié entre-temps. Actualisez la page puis réessayez.",
  };
  return messages[error.code];
};
const isRedirect = (error: unknown) => typeof error === "object" && error !== null && (("digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) || "redirectTo" in error);
const complete = (path: string): never => { revalidatePath("/admin"); revalidatePath("/admin/formations"); revalidatePath(path); redirect(path); };
const validateTranslation = (data: FormData, label: string) => {
  const selectedLocale = locale(data);
  const name = value(data, "name");
  const slug = value(data, "slug");
  if (!selectedLocale || !name || !slug) return null;
  return { locale: selectedLocale, name, slug, label };
};

export async function createDomainAction(_state: CatalogueActionState, data: FormData): Promise<CatalogueActionState> {
  await requireAdmin();
  const translation = validateTranslation(data, "Domaine");
  if (!translation) return { error: "Le nom, le slug et la langue sont requis." };
  try { const domain = await catalogueService.createTrainingDomain(order(data)); await catalogueService.upsertTrainingDomainTranslation(domain.id, translation); complete(`/admin/formations/domaines/${domain.id}`); return {}; } catch (error) { if (isRedirect(error)) throw error; return { error: adminError(error) }; }
}
export async function saveDomainAction(_state: CatalogueActionState, data: FormData): Promise<CatalogueActionState> {
  await requireAdmin(); const id = value(data, "id"); const translation = validateTranslation(data, "Domaine"); if (!id || !translation) return { error: "Le nom, le slug et la langue sont requis." };
  try { await catalogueService.updateTrainingDomain(id, { displayOrder: order(data) }); await catalogueService.upsertTrainingDomainTranslation(id, translation); complete(`/admin/formations/domaines/${id}`); return {}; } catch (error) { if (isRedirect(error)) throw error; return { error: adminError(error) }; }
}
export async function createTopicAction(_state: CatalogueActionState, data: FormData): Promise<CatalogueActionState> {
  await requireAdmin(); const domainId = value(data, "domainId"); const translation = validateTranslation(data, "Thématique"); if (!domainId || !translation) return { error: "Le domaine, le nom, le slug et la langue sont requis." };
  try { const topic = await catalogueService.createTrainingTopic(domainId, order(data)); await catalogueService.upsertTrainingTopicTranslation(topic.id, translation); complete(`/admin/formations/thematiques/${topic.id}`); return {}; } catch (error) { if (isRedirect(error)) throw error; return { error: adminError(error) }; }
}
export async function saveTopicAction(_state: CatalogueActionState, data: FormData): Promise<CatalogueActionState> {
  await requireAdmin(); const id = value(data, "id"), domainId = value(data, "domainId"); const translation = validateTranslation(data, "Thématique"); if (!id || !domainId || !translation) return { error: "Le domaine, le nom, le slug et la langue sont requis." };
  try { await catalogueService.moveTrainingTopic(id, domainId); await catalogueService.updateTrainingTopic(id, { displayOrder: order(data) }); await catalogueService.upsertTrainingTopicTranslation(id, translation); complete(`/admin/formations/thematiques/${id}`); return {}; } catch (error) { if (isRedirect(error)) throw error; return { error: adminError(error) }; }
}
export async function createTrainingAction(_state: CatalogueActionState, data: FormData): Promise<CatalogueActionState> {
  await requireAdmin(); const topicId = value(data, "topicId"); const selectedLocale = locale(data); const title = value(data, "title"), slug = value(data, "slug"); if (!topicId || !selectedLocale || !title || !slug) return { error: "La thématique, le titre, le slug et la langue sont requis." };
  try { const training = await catalogueService.createTraining(topicId); await catalogueService.upsertTrainingTranslation(training.id, { locale: selectedLocale, title, slug, summary: optional(data, "summary"), description: optional(data, "description"), objectives: optional(data, "objectives"), targetAudience: optional(data, "targetAudience"), program: optional(data, "program") }); complete(`/admin/formations/${training.id}`); return {}; } catch (error) { if (isRedirect(error)) throw error; return { error: adminError(error) }; }
}
export async function saveTrainingAction(_state: CatalogueActionState, data: FormData): Promise<CatalogueActionState> {
  await requireAdmin(); const id = value(data, "id"), topicId = value(data, "topicId"), selectedLocale = locale(data); const title = value(data, "title"), slug = value(data, "slug"); if (!id || !topicId || !selectedLocale || !title || !slug) return { error: "La thématique, le titre, le slug et la langue sont requis." };
  try { await catalogueService.updateTraining(id); await catalogueService.moveTraining(id, topicId); await catalogueService.upsertTrainingTranslation(id, { locale: selectedLocale, title, slug, summary: optional(data, "summary"), description: optional(data, "description"), objectives: optional(data, "objectives"), targetAudience: optional(data, "targetAudience"), program: optional(data, "program") }); complete(`/admin/formations/${id}`); return {}; } catch (error) { if (isRedirect(error)) throw error; return { error: adminError(error) }; }
}
export async function lifecycleAction(_state: CatalogueActionState, data: FormData): Promise<CatalogueActionState> {
  await requireAdmin(); const kind = value(data, "kind"), id = value(data, "id"), intent = value(data, "intent"), path = value(data, "path"); if (!id || !path) return { error: "Action invalide." };
  try {
    const services = kind === "domain" ? { publish: catalogueService.publishTrainingDomain, archive: catalogueService.archiveTrainingDomain, remove: catalogueService.deleteTrainingDomainDraft } : kind === "topic" ? { publish: catalogueService.publishTrainingTopic, archive: catalogueService.archiveTrainingTopic, remove: catalogueService.deleteTrainingTopicDraft } : { publish: catalogueService.publishTraining, archive: catalogueService.archiveTraining, remove: catalogueService.deleteTrainingDraft };
    if (intent === "publish") await services.publish(id); else if (intent === "archive") await services.archive(id); else if (intent === "delete" && value(data, "confirmation") === "SUPPRIMER") { await services.remove(id); revalidatePath("/admin"); revalidatePath("/admin/formations"); redirect("/admin/formations"); } else return { error: "Saisissez SUPPRIMER pour confirmer cette suppression de brouillon." };
    complete(path); return {};
  } catch (error) { if (isRedirect(error)) throw error; return { error: adminError(error) }; }
}
export async function translationPublicationAction(_state: CatalogueActionState, data: FormData): Promise<CatalogueActionState> {
  await requireAdmin(); const kind = value(data, "kind"), id = value(data, "id"), path = value(data, "path"), selectedLocale = locale(data), intent = value(data, "intent"); if (!id || !path || !selectedLocale) return { error: "Action de traduction invalide." };
  try {
    const service = kind === "domain" ? (intent === "publish" ? catalogueService.publishTrainingDomainTranslation : catalogueService.unpublishTrainingDomainTranslation) : kind === "topic" ? (intent === "publish" ? catalogueService.publishTrainingTopicTranslation : catalogueService.unpublishTrainingTopicTranslation) : (intent === "publish" ? catalogueService.publishTrainingTranslation : catalogueService.unpublishTrainingTranslation);
    await service(id, selectedLocale); complete(`${path}?locale=${selectedLocale}`); return {};
  } catch (error) { if (isRedirect(error)) throw error; return { error: adminError(error) }; }
}
