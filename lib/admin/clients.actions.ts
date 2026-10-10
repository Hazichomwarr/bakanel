"use server";

import { unexpectedAdminActionError } from "@/lib/admin/action-errors";
import { EngagementType, Locale } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/current-admin";
import { ClientWorkDomainError } from "@/lib/client-work.errors";
import { clientWorkService } from "@/lib/client-work.service";

export type ClientActionState = { error?: string };

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalFormValue(formData: FormData, name: string) {
  return formValue(formData, name) || null;
}

function formDate(formData: FormData, name: string) {
  const value = formValue(formData, name);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formLocale(formData: FormData) {
  const locale = formValue(formData, "locale");
  return locale === Locale.FR || locale === Locale.EN || locale === Locale.PT ? locale : null;
}

function formEngagementType(formData: FormData) {
  const type = formValue(formData, "type");
  return Object.values(EngagementType).includes(type as EngagementType)
    ? (type as EngagementType)
    : null;
}

function isRedirect(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  return (
    ("digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) ||
    "redirectTo" in error
  );
}

function revalidateClientPaths(path: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/clients");
  revalidatePath(path);
}

function actionErrorMessage(error: unknown) {
  if (!(error instanceof ClientWorkDomainError)) {
    return unexpectedAdminActionError("clients", error);
  }

  const messages: Record<ClientWorkDomainError["code"], string> = {
    CLIENT_ORGANIZATION_NOT_FOUND: "Cette organisation n’existe plus.",
    INVALID_CLIENT_ORGANIZATION: "Les informations de l’organisation sont invalides.",
    STALE_CLIENT_ORGANIZATION_STATE: "Cette organisation a été modifiée entre-temps. Actualisez puis réessayez.",
    CLIENT_ENGAGEMENT_NOT_FOUND: "Cette mission n’existe plus.",
    INVALID_CLIENT_ENGAGEMENT: "Le type de mission est invalide.",
    INVALID_ENGAGEMENT_DATES: "Les dates de mission ne sont pas cohérentes.",
    INVALID_ENGAGEMENT_TRANSITION: "Cette transition de mission n’est pas autorisée.",
    ENGAGEMENT_IMMUTABLE: "Cette mission terminée est un enregistrement historique en lecture seule.",
    ENGAGEMENT_TRANSLATION_NOT_FOUND: "Cette présentation n’existe pas encore.",
    INVALID_ENGAGEMENT_TRANSLATION: "La présentation est invalide.",
    STALE_CLIENT_ENGAGEMENT_STATE: "Cette mission a été modifiée entre-temps. Actualisez puis réessayez.",
  };

  return messages[error.code];
}

export async function createOrganizationAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireAdmin();
  const name = formValue(formData, "name");

  if (!name) return { error: "Le nom de l’organisation est requis." };

  try {
    const organization = await clientWorkService.createClientOrganization({
      name,
      country: optionalFormValue(formData, "country"),
      logoReference: optionalFormValue(formData, "logoReference"),
    });
    const path = `/admin/clients/${organization.id}`;
    revalidateClientPaths(path);
    redirect(path);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: actionErrorMessage(error) };
  }
}

export async function saveOrganizationAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireAdmin();
  const organizationId = formValue(formData, "id");
  const name = formValue(formData, "name");

  if (!organizationId || !name) return { error: "Le nom de l’organisation est requis." };

  try {
    await clientWorkService.updateClientOrganization(organizationId, {
      name,
      country: optionalFormValue(formData, "country"),
      logoReference: optionalFormValue(formData, "logoReference"),
    });
    const path = `/admin/clients/${organizationId}`;
    revalidateClientPaths(path);
    redirect(path);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: actionErrorMessage(error) };
  }
}

export async function organizationLifecycleAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireAdmin();
  const organizationId = formValue(formData, "id");
  const intent = formValue(formData, "intent");

  try {
    if (intent === "deactivate") {
      await clientWorkService.deactivateClientOrganization(organizationId);
    } else if (intent === "activate") {
      await clientWorkService.activateClientOrganization(organizationId);
    } else {
      return { error: "Action invalide." };
    }

    const path = `/admin/clients/${organizationId}`;
    revalidateClientPaths(path);
    redirect(path);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: actionErrorMessage(error) };
  }
}

export async function createEngagementAction(
  clientOrganizationId: string,
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireAdmin();
  const submittedOrganizationId = formValue(formData, "clientOrganizationId");
  const type = formEngagementType(formData);
  const locale = formLocale(formData);
  const startDate = formDate(formData, "startDate");
  const endDate = formDate(formData, "endDate");
  const title = formValue(formData, "title");

  if (!clientOrganizationId || submittedOrganizationId !== clientOrganizationId || !type || !locale || startDate === undefined || endDate === undefined || !title) {
    return { error: "Renseignez le type, le titre et des dates valides." };
  }

  try {
    const engagement = await clientWorkService.createClientEngagementWithTranslation(
      { clientOrganizationId, type, startDate, endDate },
      { locale, title, description: optionalFormValue(formData, "description") },
    );
    const organizationPath = `/admin/clients/${clientOrganizationId}`;
    const engagementPath = `/admin/clients/missions/${engagement.id}`;
    revalidateClientPaths(organizationPath);
    revalidateClientPaths(engagementPath);
    redirect(engagementPath);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: actionErrorMessage(error) };
  }
}

export async function engagementAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireAdmin();
  const engagementId = formValue(formData, "id");
  const intent = formValue(formData, "intent");
  const path = `/admin/clients/missions/${engagementId}`;

  try {
    if (intent === "complete") {
      await clientWorkService.completeClientEngagement(engagementId);
    } else if (intent === "public") {
      await clientWorkService.makeClientEngagementPublic(engagementId);
    } else if (intent === "private") {
      await clientWorkService.makeClientEngagementPrivate(engagementId);
    } else {
      return { error: "Action invalide." };
    }
    revalidateClientPaths(path);
    redirect(path);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: actionErrorMessage(error) };
  }
}

export async function saveEngagementAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireAdmin();
  const engagementId = formValue(formData, "id");
  const type = formEngagementType(formData);
  const startDate = formDate(formData, "startDate");
  const endDate = formDate(formData, "endDate");
  const path = `/admin/clients/missions/${engagementId}`;

  if (!engagementId || !type || startDate === undefined || endDate === undefined) {
    return { error: "Le type et les dates sont invalides." };
  }

  try {
    await clientWorkService.updateClientEngagement(engagementId, { type, startDate, endDate });
    revalidateClientPaths(path);
    redirect(path);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: actionErrorMessage(error) };
  }
}

export async function saveEngagementTranslationAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireAdmin();
  const engagementId = formValue(formData, "id");
  const locale = formLocale(formData);
  const title = formValue(formData, "title");
  const path = `/admin/clients/missions/${engagementId}`;

  if (!engagementId || !locale || !title) return { error: "La langue et le titre sont requis." };

  try {
    await clientWorkService.upsertClientEngagementTranslation(engagementId, {
      locale,
      title,
      description: optionalFormValue(formData, "description"),
    });
    revalidateClientPaths(path);
    redirect(`${path}?locale=${locale}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: actionErrorMessage(error) };
  }
}

export async function engagementTranslationPublicationAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireAdmin();
  const engagementId = formValue(formData, "id");
  const locale = formLocale(formData);
  const intent = formValue(formData, "intent");
  const path = `/admin/clients/missions/${engagementId}`;

  if (!engagementId || !locale) return { error: "Action invalide." };

  try {
    if (intent === "publish") {
      await clientWorkService.publishClientEngagementTranslation(engagementId, locale);
    } else if (intent === "unpublish") {
      await clientWorkService.unpublishClientEngagementTranslation(engagementId, locale);
    } else {
      return { error: "Action invalide." };
    }
    revalidateClientPaths(path);
    redirect(`${path}?locale=${locale}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: actionErrorMessage(error) };
  }
}
