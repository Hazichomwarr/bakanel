import Link from "next/link";
import { Locale } from "@prisma/client";

import {
  ADMIN_PROGRAMME_PAGE_SIZE,
  catalogueLocales,
  type adminCatalogueReader,
} from "@/lib/admin/catalogue.read";

import { statusLabel } from "./components";

type ProgrammePage = Awaited<ReturnType<typeof adminCatalogueReader.programmes>>;
type ProgrammeRow = ProgrammePage["programmes"][number];

const localeCodes: Record<Locale, string> = { FR: "FR", EN: "EN", PT: "PT" };

/** French title first; otherwise another locale's title, marked with its language. */
export function programmeTitle(programme: Pick<ProgrammeRow, "translations">) {
  const french = programme.translations.find((translation) => translation.locale === Locale.FR);

  if (french) {
    return { title: french.title, fallbackLocale: null };
  }

  const other = programme.translations[0];

  if (other) {
    return { title: other.title, fallbackLocale: localeCodes[other.locale] };
  }

  return { title: "Formation sans titre", fallbackLocale: null };
}

function taxonomyPath(programme: ProgrammeRow) {
  const topic = programme.trainingTopic.translations[0]?.name ?? "Thématique sans nom français";
  const domain =
    programme.trainingTopic.trainingDomain.translations[0]?.name ?? "Domaine sans nom français";

  return `${domain} → ${topic}`;
}

function translationSummary(programme: ProgrammeRow) {
  return catalogueLocales.map((locale) => {
    const translation = programme.translations.find((entry) => entry.locale === locale);
    const state = translation ? (translation.isPublished ? "visible" : "non publiée") : "absente";

    return `${localeCodes[locale]} ${state}`;
  });
}

function pageHref(page: number) {
  return page === 1 ? "/admin/formations#programmes" : `/admin/formations?page=${page}#programmes`;
}

export function ProgrammeList({ result }: { result: ProgrammePage }) {
  const firstShown = (result.page - 1) * ADMIN_PROGRAMME_PAGE_SIZE + 1;
  const lastShown = firstShown + result.programmes.length - 1;

  return (
    <section aria-labelledby="programmes-heading" id="programmes">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#c8cac0] pb-4">
        <h2 id="programmes-heading" className="wb-mono text-xs tracking-[0.16em] text-[#245b49]">
          FORMATIONS
        </h2>
        {result.total > 0 && (
          <p className="text-sm text-[#626862]">
            {result.total} formation{result.total !== 1 ? "s" : ""}, tous états confondus
          </p>
        )}
      </div>

      {result.programmes.length === 0 ? (
        <div className="py-14">
          <h3 className="text-2xl font-semibold">Aucune formation</h3>
          <p className="mt-3 max-w-xl leading-7 text-[#626862]">
            Les formations créées apparaîtront ici, qu’elles soient en brouillon, publiées ou
            archivées.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#c8cac0]">
          {result.programmes.map((programme) => {
            const { title, fallbackLocale } = programmeTitle(programme);

            return (
              <li key={programme.id} className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/admin/formations/${programme.id}`}
                      className="wb-focus text-lg font-semibold hover:text-[#245b49]"
                    >
                      {title}
                      {fallbackLocale && (
                        <span className="ml-2 text-sm font-normal text-[#626862]">
                          (titre {fallbackLocale}, sans traduction française)
                        </span>
                      )}
                    </Link>
                    <p className="mt-2 text-sm text-[#626862]">{taxonomyPath(programme)}</p>
                    <p className="mt-1 text-xs text-[#626862]">
                      {translationSummary(programme).join(" · ")}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-[#245b49]">
                    {statusLabel[programme.status]}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {result.pageCount > 1 && (
        <nav
          aria-label="Pagination des formations"
          className="flex flex-wrap items-center justify-between gap-4 border-t border-[#c8cac0] pt-5 text-sm"
        >
          <p className="text-[#626862]">
            {firstShown}–{lastShown} sur {result.total} · page {result.page} sur {result.pageCount}
          </p>
          <div className="flex gap-5">
            {result.page > 1 && (
              <Link
                href={pageHref(result.page - 1)}
                className="wb-action wb-focus border-b border-current font-medium"
              >
                Page précédente
              </Link>
            )}
            {result.page < result.pageCount && (
              <Link
                href={pageHref(result.page + 1)}
                className="wb-action wb-focus border-b border-current font-medium"
              >
                Page suivante
              </Link>
            )}
          </div>
        </nav>
      )}
    </section>
  );
}
