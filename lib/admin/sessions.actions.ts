"use server";

import { unexpectedAdminActionError } from "@/lib/admin/action-errors";
import { DeliveryMode, PricingMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { TrainingSessionDomainError } from "@/lib/training-session.errors";
import { trainingSessionService } from "@/lib/training-session.service";

export type SessionActionState = { error?: string };
const text = (data: FormData, key: string) => typeof data.get(key) === "string" ? String(data.get(key)).trim() : "";
const nullable = (data: FormData, key: string) => text(data, key) || null;
const calendarDate = (data: FormData, key: string, required = false) => {
  const value = text(data, key);
  if (!value) return required ? undefined : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const capacity = (data: FormData) => { const value = text(data, "capacity"); if (!value) return null; const result = Number(value); return Number.isInteger(result) ? result : undefined; };
const facts = (data: FormData) => {
  const startDate = calendarDate(data, "startDate", true), endDate = calendarDate(data, "endDate", true), registrationDeadline = calendarDate(data, "registrationDeadline");
  const deliveryMode = text(data, "deliveryMode") === DeliveryMode.ONLINE ? DeliveryMode.ONLINE : text(data, "deliveryMode") === DeliveryMode.IN_PERSON ? DeliveryMode.IN_PERSON : undefined;
  const pricingMode = text(data, "pricingMode") === PricingMode.ON_REQUEST ? PricingMode.ON_REQUEST : text(data, "pricingMode") === PricingMode.FIXED ? PricingMode.FIXED : undefined;
  const configuredCapacity = capacity(data);
  if (!startDate || !endDate || registrationDeadline === undefined || !deliveryMode || !pricingMode || configuredCapacity === undefined) return null;
  const online = deliveryMode === DeliveryMode.ONLINE, onRequest = pricingMode === PricingMode.ON_REQUEST;
  return { startDate, endDate, registrationDeadline, deliveryMode, country: online ? null : nullable(data, "country"), city: online ? null : nullable(data, "city"), venue: online ? null : nullable(data, "venue"), pricingMode, price: onRequest ? null : nullable(data, "price"), currency: onRequest ? null : nullable(data, "currency"), capacity: configuredCapacity };
};
const errorMessage = (error: unknown) => {
  if (!(error instanceof TrainingSessionDomainError)) return unexpectedAdminActionError("sessions", error);
  const messages: Record<TrainingSessionDomainError["code"], string> = {
    SESSION_NOT_FOUND: "Cette session n’existe plus.", TRAINING_NOT_FOUND: "Cette formation n’existe plus.", EXPERT_NOT_FOUND: "Cet expert n’existe plus.", EXPERT_INACTIVE: "Cet expert n’est plus actif et ne peut pas être affecté.", INVALID_TRANSITION: "Cette transition d’état n’est pas autorisée pour cette session.", SESSION_IMMUTABLE: "Cette session historique est en lecture seule.", STALE_SESSION_STATE: "La session a été modifiée entre-temps. Actualisez la page puis réessayez.", INVALID_DATE_RANGE: "La date de fin doit être postérieure ou égale à la date de début.", INVALID_REGISTRATION_DEADLINE: "La date limite d’inscription doit être au plus tard le jour du début.", INVALID_PRICING: "Le mode de tarification et le prix ne sont pas cohérents.", INVALID_CURRENCY: "La devise doit être un code ISO 4217 pris en charge.", INVALID_LOCATION: "Une session en présentiel requiert un pays et une ville.", INVALID_COUNTRY: "Le pays doit être un code ISO 3166-1 alpha-2 valide.", INVALID_CAPACITY: "La capacité doit être un nombre entier positif.", EXPERT_ALREADY_ASSIGNED: "Cet expert est déjà affecté à cette session.", EXPERT_NOT_ASSIGNED: "Cet expert n’est pas affecté à cette session.",
  };
  return messages[error.code];
};
const isRedirect = (error: unknown) => typeof error === "object" && error !== null && (("digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) || "redirectTo" in error);
const refreshed = (path: string) => { revalidatePath("/admin"); revalidatePath("/admin/sessions"); revalidatePath(path); };

export async function createSessionAction(_state: SessionActionState, data: FormData): Promise<SessionActionState> {
  await requireAdmin(); const input = facts(data), trainingId = text(data, "trainingId"); if (!input || !trainingId) return { error: "Renseignez la formation et les informations de planification requises." };
  try { const session = await trainingSessionService.createTrainingSession({ ...input, trainingId }); for (const expertId of data.getAll("expertIds").filter((id): id is string => typeof id === "string" && Boolean(id))) await trainingSessionService.assignExpertToTrainingSession(session.id, expertId); const path = `/admin/sessions/${session.id}`; refreshed(path); redirect(path); } catch (error) { if (isRedirect(error)) throw error; return { error: errorMessage(error) }; }
}
export async function saveSessionAction(_state: SessionActionState, data: FormData): Promise<SessionActionState> {
  await requireAdmin(); const input = facts(data), id = text(data, "id"); if (!input || !id) return { error: "Renseignez les informations de planification requises." };
  try { await trainingSessionService.updateTrainingSession(id, input); const path = `/admin/sessions/${id}`; refreshed(path); redirect(path); } catch (error) { if (isRedirect(error)) throw error; return { error: errorMessage(error) }; }
}
export async function sessionLifecycleAction(_state: SessionActionState, data: FormData): Promise<SessionActionState> {
  await requireAdmin(); const id = text(data, "id"), intent = text(data, "intent"); if (!id) return { error: "Action invalide." };
  try { if (intent === "open") await trainingSessionService.openTrainingSession(id); else if (intent === "close") await trainingSessionService.closeTrainingSession(id); else if (intent === "complete") await trainingSessionService.completeTrainingSession(id); else if (intent === "cancel") await trainingSessionService.cancelTrainingSession(id); else return { error: "Action invalide." }; const path = `/admin/sessions/${id}`; refreshed(path); redirect(path); } catch (error) { if (isRedirect(error)) throw error; return { error: errorMessage(error) }; }
}
export async function assignSessionExpertAction(_state: SessionActionState, data: FormData): Promise<SessionActionState> {
  await requireAdmin(); const id = text(data, "id"), expertId = text(data, "expertId"); if (!id || !expertId) return { error: "Sélectionnez un expert." }; try { await trainingSessionService.assignExpertToTrainingSession(id, expertId); const path = `/admin/sessions/${id}`; refreshed(path); redirect(path); } catch (error) { if (isRedirect(error)) throw error; return { error: errorMessage(error) }; }
}
export async function removeSessionExpertAction(_state: SessionActionState, data: FormData): Promise<SessionActionState> {
  await requireAdmin(); const id = text(data, "id"), expertId = text(data, "expertId"); if (!id || !expertId) return { error: "Action invalide." }; try { await trainingSessionService.removeExpertFromTrainingSession(id, expertId); const path = `/admin/sessions/${id}`; refreshed(path); redirect(path); } catch (error) { if (isRedirect(error)) throw error; return { error: errorMessage(error) }; }
}
