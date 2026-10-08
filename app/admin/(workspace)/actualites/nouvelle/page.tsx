import { requireAdmin } from "@/lib/auth/current-admin";
import { createArticleAction } from "@/lib/admin/articles.actions";

import { ClientForm } from "../../clients/forms";

export default async function NewArticlePage() {
  await requireAdmin();

  return (
    <div className="max-w-3xl">
      <p className="wb-mono text-xs tracking-[.16em] text-[#245b49]">NOUVEL ARTICLE</p>
      <h1 className="mt-4 text-3xl font-semibold">Brouillon éditorial</h1>
      <p className="mt-3 text-[#626862]">
        La première traduction française est enregistrée avec l’article.
      </p>
      <div className="mt-10">
        <ClientForm action={createArticleAction} label="Créer le brouillon">
          <input type="hidden" name="locale" value="FR" />
          <label className="flex flex-col gap-2 text-sm font-medium">
            Titre
            <input
              required
              name="title"
              className="min-h-11 border border-[#a8aaa1] bg-[#fbfaf7] px-3"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Slug
            <input
              required
              name="slug"
              className="min-h-11 border border-[#a8aaa1] bg-[#fbfaf7] px-3"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Résumé
            <textarea
              name="excerpt"
              rows={3}
              className="border border-[#a8aaa1] bg-[#fbfaf7] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Contenu
            <textarea
              required
              name="content"
              rows={12}
              className="border border-[#a8aaa1] bg-[#fbfaf7] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Référence de couverture
            <input
              name="coverReference"
              className="min-h-11 border border-[#a8aaa1] bg-[#fbfaf7] px-3"
            />
          </label>
        </ClientForm>
      </div>
    </div>
  );
}
