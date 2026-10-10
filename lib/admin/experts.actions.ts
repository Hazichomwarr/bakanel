"use server";
import { unexpectedAdminActionError } from "@/lib/admin/action-errors";
import { Locale } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { ExpertDomainError } from "@/lib/expert.errors";
import { expertService } from "@/lib/expert.service";

export type ExpertActionState = { error?: string };
const value = (data: FormData, key: string) => typeof data.get(key) === "string" ? String(data.get(key)).trim() : "";
const optional = (data: FormData, key: string) => value(data, key) || null;
const locale = (data: FormData) => { const candidate = value(data, "locale"); return candidate === Locale.FR || candidate === Locale.EN || candidate === Locale.PT ? candidate : null; };
const order = (data: FormData) => { const raw = value(data, "displayOrder") || "0"; return /^-?\d+$/.test(raw) ? Number(raw) : null; };
const errorMessage = (error: unknown) => {
  if (!(error instanceof ExpertDomainError)) return unexpectedAdminActionError("experts", error);
  const messages: Record<ExpertDomainError["code"], string> = { EXPERT_NOT_FOUND: "Cet expert n’existe plus.", INVALID_EXPERT: "Le nom et l’ordre doivent être valides.", INVALID_EXPERT_TRANSITION: "Cette transition d’état n’est pas autorisée.", INVALID_EXPERT_TRANSLATION: "Cette présentation est invalide. Un titre professionnel est requis pour la publier.", EXPERT_TRANSLATION_NOT_FOUND: "Cette traduction n’existe pas encore.", STALE_EXPERT_STATE: "Cet expert a été modifié entre-temps. Actualisez la page puis réessayez." };
  return messages[error.code];
};
const redirected = (error: unknown) => typeof error === "object" && error !== null && (("digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) || "redirectTo" in error);
const refresh = (path: string) => { revalidatePath("/admin"); revalidatePath("/admin/experts"); revalidatePath("/admin/sessions"); revalidatePath(path); };
const translation = (data: FormData) => { const selected = locale(data); return selected ? { locale: selected, professionalTitle: optional(data, "professionalTitle"), specialization: optional(data, "specialization"), biography: optional(data, "biography") } : null; };

export async function createExpertAction(_state: ExpertActionState, data: FormData): Promise<ExpertActionState> { await requireAdmin(); const name = value(data, "name"), displayOrder = order(data), input = translation(data); if (!name || displayOrder === null || !input) return { error: "Le nom, l’ordre et la langue sont requis." }; try { const expert = await expertService.createExpertWithTranslation({ name, displayOrder, portraitReference: optional(data, "portraitReference") }, input); const path = `/admin/experts/${expert.id}`; refresh(path); redirect(path); } catch (error) { if (redirected(error)) throw error; return { error: errorMessage(error) }; } }
export async function saveExpertAction(_state: ExpertActionState, data: FormData): Promise<ExpertActionState> { await requireAdmin(); const id = value(data, "id"), name = value(data, "name"), displayOrder = order(data), input = translation(data); if (!id || !name || displayOrder === null || !input) return { error: "Le nom, l’ordre et la langue sont requis." }; try { await expertService.updateExpert(id, { name, displayOrder, portraitReference: optional(data, "portraitReference") }); await expertService.upsertExpertTranslation(id, input); const path = `/admin/experts/${id}`; refresh(path); redirect(`${path}?locale=${input.locale}`); } catch (error) { if (redirected(error)) throw error; return { error: errorMessage(error) }; } }
export async function expertLifecycleAction(_state: ExpertActionState, data: FormData): Promise<ExpertActionState> { await requireAdmin(); const id = value(data, "id"), intent = value(data, "intent"); if (!id) return { error: "Action invalide." }; try { if (intent === "deactivate") await expertService.deactivateExpert(id); else if (intent === "activate") await expertService.activateExpert(id); else return { error: "Action invalide." }; const path = `/admin/experts/${id}`; refresh(path); redirect(path); } catch (error) { if (redirected(error)) throw error; return { error: errorMessage(error) }; } }
export async function expertTranslationPublicationAction(_state: ExpertActionState, data: FormData): Promise<ExpertActionState> { await requireAdmin(); const id = value(data, "id"), selected = locale(data), intent = value(data, "intent"); if (!id || !selected) return { error: "Action invalide." }; try { if (intent === "publish") await expertService.publishExpertTranslation(id, selected); else if (intent === "unpublish") await expertService.unpublishExpertTranslation(id, selected); else return { error: "Action invalide." }; const path = `/admin/experts/${id}`; refresh(path); redirect(`${path}?locale=${selected}`); } catch (error) { if (redirected(error)) throw error; return { error: errorMessage(error) }; } }
