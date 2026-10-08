import Link from "next/link";

import { requireAdmin } from "@/lib/auth/current-admin";
import { adminArticlesReader } from "@/lib/admin/articles.read";

const statusLabel = { DRAFT: "Brouillon", PUBLISHED: "Publié", ARCHIVED: "Archivé" } as const;

export default async function ArticlesPage() {
  await requireAdmin();
  const articles = await adminArticlesReader.list();

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[#18211d] pb-7">
        <div>
          <p className="wb-mono text-xs tracking-[.16em] text-[#245b49]">
            ACTUALITÉS &amp; PUBLICATIONS
          </p>
          <h1 className="mt-4 text-3xl font-semibold md:text-4xl">Bureau éditorial</h1>
          <p className="mt-3 text-[#626862]">Articles, langues et statut de publication.</p>
        </div>
        <Link
          href="/admin/actualites/nouvelle"
          className="wb-focus min-h-11 bg-[#15382f] px-5 py-2 text-sm font-medium text-white"
        >
          Nouvel article
        </Link>
      </header>
      {articles.length ? (
        <ul className="divide-y divide-[#c8cac0]">
          {articles.map((article) => {
            const frenchTranslation = article.translations.find(
              (translation) => translation.locale === "FR",
            );
            const publishedLocales = article.translations
              .filter((translation) => translation.isPublished)
              .map((translation) => translation.locale)
              .join(", ");

            return (
              <li key={article.id} className="py-5">
                <Link
                  href={`/admin/actualites/${article.id}`}
                  className="wb-focus flex flex-wrap justify-between gap-4"
                >
                  <span>
                    <b className="text-lg">
                      {frenchTranslation?.title ?? "Article sans titre français"}
                    </b>
                    <span className="mt-1 block text-sm text-[#626862]">
                      {article.translations.length} langue
                      {article.translations.length > 1 ? "s" : ""} ·{" "}
                      {publishedLocales || "Aucune langue publiée"}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    {statusLabel[article.status]}
                    <span className="mt-1 block text-[#626862]">
                      {article.publishedAt
                        ? `Publié le ${article.publishedAt.toLocaleDateString("fr-FR")}`
                        : "Non publié"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="border-y border-[#c8cac0] py-12">
          <p className="text-xl font-semibold">Aucun article.</p>
          <p className="mt-2 text-[#626862]">Créez le premier article institutionnel.</p>
        </section>
      )}
    </div>
  );
}
