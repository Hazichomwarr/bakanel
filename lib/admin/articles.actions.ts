"use server";

import { unexpectedAdminActionError } from "@/lib/admin/action-errors";
import { Locale } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/current-admin";
import { ArticleDomainError } from "@/lib/article.errors";
import { articleService } from "@/lib/article.service";

export type ArticleActionState = { error?: string };

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item.trim() : "";
}

function optional(formData: FormData, name: string) {
  return value(formData, name) || null;
}

function locale(formData: FormData) {
  const candidate = value(formData, "locale");
  return candidate === Locale.FR || candidate === Locale.EN || candidate === Locale.PT
    ? candidate
    : null;
}

function redirected(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (("digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")) ||
      "redirectTo" in error)
  );
}

function message(error: unknown) {
  if (!(error instanceof ArticleDomainError))
    return unexpectedAdminActionError("articles", error);
  const messages: Record<ArticleDomainError["code"], string> = {
    ARTICLE_NOT_FOUND: "Cet article n’existe plus.",
    INVALID_ARTICLE: "Les informations de l’article sont invalides.",
    INVALID_ARTICLE_TRANSITION: "Cette transition éditoriale n’est pas autorisée.",
    ARTICLE_ESTABLISHED: "Seuls les brouillons peuvent être supprimés.",
    ARTICLE_TRANSLATION_NOT_FOUND: "Cette traduction n’existe pas encore.",
    INVALID_ARTICLE_TRANSLATION: "Le slug, le titre et le contenu sont requis.",
    ARTICLE_SLUG_CONFLICT: "Ce slug est déjà utilisé dans cette langue.",
    STALE_ARTICLE_STATE: "Cet article a été modifié entre-temps. Actualisez puis réessayez.",
  };
  return messages[error.code];
}

function refresh(path: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/actualites");
  revalidatePath(path);
}

function translationInput(formData: FormData) {
  const selectedLocale = locale(formData);
  const slug = value(formData, "slug");
  const title = value(formData, "title");
  const content = value(formData, "content");
  if (!selectedLocale || !slug || !title || !content) return null;
  return { locale: selectedLocale, slug, title, content, excerpt: optional(formData, "excerpt") };
}

export async function createArticleAction(
  _state: ArticleActionState,
  formData: FormData,
): Promise<ArticleActionState> {
  await requireAdmin();
  const translation = translationInput(formData);
  if (!translation) return { error: "Le slug, le titre, le contenu et la langue sont requis." };
  try {
    const article = await articleService.createArticleWithTranslation(
      { coverReference: optional(formData, "coverReference") },
      translation,
    );
    const path = `/admin/actualites/${article.id}`;
    refresh(path);
    redirect(path);
  } catch (error) {
    if (redirected(error)) throw error;
    return { error: message(error) };
  }
}

export async function saveArticleAction(
  articleId: string,
  _state: ArticleActionState,
  formData: FormData,
): Promise<ArticleActionState> {
  await requireAdmin();
  if (value(formData, "id") !== articleId)
    return { error: "L’identité de l’article ne correspond pas." };
  const translation = translationInput(formData);
  if (!translation) return { error: "Le slug, le titre, le contenu et la langue sont requis." };
  try {
    await articleService.updateArticle(articleId, {
      coverReference: optional(formData, "coverReference"),
    });
    await articleService.upsertArticleTranslation(articleId, translation);
    const path = `/admin/actualites/${articleId}`;
    refresh(path);
    redirect(`${path}?locale=${translation.locale}`);
  } catch (error) {
    if (redirected(error)) throw error;
    return { error: message(error) };
  }
}

export async function articleLifecycleAction(
  articleId: string,
  _state: ArticleActionState,
  formData: FormData,
): Promise<ArticleActionState> {
  await requireAdmin();
  if (value(formData, "id") !== articleId)
    return { error: "L’identité de l’article ne correspond pas." };
  const intent = value(formData, "intent");
  try {
    if (intent === "publish") await articleService.publishArticle(articleId);
    else if (intent === "archive") await articleService.archiveArticle(articleId);
    else return { error: "Action invalide." };
    const path = `/admin/actualites/${articleId}`;
    refresh(path);
    redirect(path);
  } catch (error) {
    if (redirected(error)) throw error;
    return { error: message(error) };
  }
}

export async function articleTranslationPublicationAction(
  articleId: string,
  _state: ArticleActionState,
  formData: FormData,
): Promise<ArticleActionState> {
  await requireAdmin();
  if (value(formData, "id") !== articleId)
    return { error: "L’identité de l’article ne correspond pas." };
  const selectedLocale = locale(formData);
  const intent = value(formData, "intent");
  if (!selectedLocale) return { error: "Action de langue invalide." };
  try {
    if (intent === "publish")
      await articleService.publishArticleTranslation(articleId, selectedLocale);
    else if (intent === "unpublish")
      await articleService.unpublishArticleTranslation(articleId, selectedLocale);
    else return { error: "Action invalide." };
    const path = `/admin/actualites/${articleId}`;
    refresh(path);
    redirect(`${path}?locale=${selectedLocale}`);
  } catch (error) {
    if (redirected(error)) throw error;
    return { error: message(error) };
  }
}
