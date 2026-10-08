import Link from "next/link";
import { Locale } from "@prisma/client";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/current-admin";
import {
  articleLifecycleAction,
  articleTranslationPublicationAction,
  saveArticleAction,
} from "@/lib/admin/articles.actions";
import { adminArticlesReader } from "@/lib/admin/articles.read";

import { ClientForm } from "../../clients/forms";

const statusLabel = { DRAFT: "Brouillon", PUBLISHED: "Publié", ARCHIVED: "Archivé" } as const;

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ articleId: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  await requireAdmin();
  const { articleId } = await params;
  const requestedLocale = (await searchParams).locale;
  const selectedLocale =
    requestedLocale === Locale.EN || requestedLocale === Locale.PT ? requestedLocale : Locale.FR;
  const article = await adminArticlesReader.detail(articleId);
  if (!article) notFound();
  const translation = article.translations.find((item) => item.locale === selectedLocale);
  const saveAction = saveArticleAction.bind(null, articleId);
  const lifecycleAction = articleLifecycleAction.bind(null, articleId);
  const translationPublicationAction = articleTranslationPublicationAction.bind(null, articleId);

  return (
    <div className="space-y-10">
      <header className="border-b border-[#18211d] pb-7">
        <p className="wb-mono text-xs tracking-[.16em] text-[#245b49]">
          ARTICLE · {statusLabel[article.status]}
        </p>
        <h1 className="mt-4 text-3xl font-semibold">
          {article.translations.find((item) => item.locale === Locale.FR)?.title ??
            "Article sans titre français"}
        </h1>
        <p className="mt-3 text-sm text-[#626862]">
          {article.publishedAt
            ? `Publié le ${article.publishedAt.toLocaleDateString("fr-FR")}`
            : "Pas encore publié"}
        </p>
      </header>
      <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-10">
          <nav
            aria-label="Langue de rédaction"
            className="flex gap-5 border-b border-[#c8cac0] pb-3"
          >
            {[Locale.FR, Locale.EN, Locale.PT].map((locale) => (
              <Link
                key={locale}
                href={`/admin/actualites/${articleId}?locale=${locale}`}
                className={`wb-focus border-b-2 pb-2 text-sm ${locale === selectedLocale ? "border-[#245b49] font-semibold" : "border-transparent"}`}
              >
                {locale === Locale.FR ? "Français" : locale === Locale.EN ? "English" : "Português"}
                {article.translations.some((item) => item.locale === locale) ? "" : " · manquante"}
              </Link>
            ))}
          </nav>
          <ClientForm action={saveAction} label="Enregistrer la langue">
            <input type="hidden" name="id" value={articleId} />
            <input type="hidden" name="locale" value={selectedLocale} />
            <label className="flex flex-col gap-2 text-sm font-medium">
              Titre
              <input
                required
                name="title"
                defaultValue={translation?.title ?? ""}
                className="min-h-11 border border-[#a8aaa1] bg-[#fbfaf7] px-3"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Slug
              <input
                required
                name="slug"
                defaultValue={translation?.slug ?? ""}
                className="min-h-11 border border-[#a8aaa1] bg-[#fbfaf7] px-3"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Résumé
              <textarea
                name="excerpt"
                rows={3}
                defaultValue={translation?.excerpt ?? ""}
                className="border border-[#a8aaa1] bg-[#fbfaf7] px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Contenu
              <textarea
                required
                name="content"
                rows={12}
                defaultValue={translation?.content ?? ""}
                className="border border-[#a8aaa1] bg-[#fbfaf7] px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Référence de couverture
              <input
                name="coverReference"
                defaultValue={article.coverReference ?? ""}
                className="min-h-11 border border-[#a8aaa1] bg-[#fbfaf7] px-3"
              />
            </label>
          </ClientForm>
        </section>
        <aside className="space-y-6 border-t border-[#c8cac0] pt-6">
          <section>
            <p className="wb-mono text-xs tracking-[.16em] text-[#245b49]">STATUT ARTICLE</p>
            <p className="mt-2 text-sm">{statusLabel[article.status]}</p>
            {article.status !== "PUBLISHED" ? (
              <ClientForm action={lifecycleAction} label="Publier l’article">
                <input type="hidden" name="id" value={articleId} />
                <input type="hidden" name="intent" value="publish" />
              </ClientForm>
            ) : null}
            {article.status !== "ARCHIVED" ? (
              <ClientForm action={lifecycleAction} label="Archiver l’article">
                <input type="hidden" name="id" value={articleId} />
                <input type="hidden" name="intent" value="archive" />
              </ClientForm>
            ) : null}
          </section>
          <section>
            <p className="wb-mono text-xs tracking-[.16em] text-[#245b49]">PUBLICATION DE LANGUE</p>
            <p className="mt-2 text-sm text-[#626862]">
              La publication de cette langue est indépendante du statut de l’article.
            </p>
            {translation ? (
              <ClientForm
                action={translationPublicationAction}
                label={translation.isPublished ? "Dépublier cette langue" : "Publier cette langue"}
              >
                <input type="hidden" name="id" value={articleId} />
                <input type="hidden" name="locale" value={selectedLocale} />
                <input
                  type="hidden"
                  name="intent"
                  value={translation.isPublished ? "unpublish" : "publish"}
                />
              </ClientForm>
            ) : (
              <p className="mt-3 text-sm text-[#626862]">
                Enregistrez cette langue avant de pouvoir la publier.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
