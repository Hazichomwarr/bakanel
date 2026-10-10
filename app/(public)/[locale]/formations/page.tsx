import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";
import { dictionaries } from "@/lib/public/content";
import type { PublicTrainingDto } from "@/lib/public/dto";
import { isPublicLocale, publicHref, type PublicLocale } from "@/lib/public/locale";
import { publicTrainingReader } from "@/lib/public/training.read";

const PAGE_SIZE = 12;
const LOOKAHEAD_LIMIT = PAGE_SIZE + 1;

type CataloguePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

type CatalogueResult =
  | { status: "available"; trainings: PublicTrainingDto[]; hasNextPage: boolean }
  | { status: "unavailable" };

function parsePage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return 1;
  }

  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function catalogueHref(locale: PublicLocale, page: number) {
  const pathname = `${publicHref(locale)}/formations`;
  return page === 1 ? pathname : `${pathname}?page=${page}`;
}

function isOperationalDatabaseError(error: unknown): error is Error {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError
  );
}

function operationalErrorLabel(error: Error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.name}:${error.code}`;
  }

  return error.name;
}

async function getCatalogue(locale: PublicLocale, page: number): Promise<CatalogueResult> {
  try {
    const results = await publicTrainingReader.listPublicTrainings(locale, {
      offset: (page - 1) * PAGE_SIZE,
      limit: LOOKAHEAD_LIMIT,
    });

    return {
      status: "available",
      trainings: results.slice(0, PAGE_SIZE),
      hasNextPage: results.length > PAGE_SIZE,
    };
  } catch (error) {
    if (!isOperationalDatabaseError(error)) {
      throw error;
    }

    console.error(`Public training catalogue unavailable (${operationalErrorLabel(error)}).`);
    return { status: "unavailable" };
  }
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CataloguePageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isPublicLocale(locale)) {
    return {};
  }

  const catalogue = dictionaries[locale].trainingCatalogue;

  return {
    title: `${catalogue.metaTitle} | W'BAKENEL Consulting Institute`,
    description: catalogue.metaDescription,
  };
}

export default async function TrainingCataloguePage({ params, searchParams }: CataloguePageProps) {
  const { locale } = await params;

  if (!isPublicLocale(locale)) {
    notFound();
  }

  const { page: requestedPage } = await searchParams;
  const page = parsePage(requestedPage);
  const dictionary = dictionaries[locale];
  const catalogue = dictionary.trainingCatalogue;
  const result = await getCatalogue(locale, page);

  // A later page may become empty after concurrent archival or a stale shared link. Returning
  // visitors to the first page avoids presenting that bounded page as an empty catalogue.
  if (result.status === "available" && result.trainings.length === 0 && page > 1) {
    redirect(catalogueHref(locale, 1));
  }

  return (
    <>
      <section className="bg-[var(--wb-green-deep)] text-white">
        <div className="mx-auto max-w-7xl px-5 pt-16 pb-20 sm:px-8 lg:pt-20 lg:pb-28 xl:px-0">
          <p className="wb-mono text-xs tracking-[0.18em] text-[#c9d8c8]">{catalogue.eyebrow}</p>
          <h1 className="wb-editorial mt-7 max-w-4xl text-5xl leading-[1.02] font-medium sm:text-6xl lg:text-7xl">
            {catalogue.title}
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#e2ece1]">{catalogue.description}</p>
          <p className="mt-8 border-l border-[#c9d8c8] pl-5 text-base leading-7 text-[#d9e7d8]">
            {catalogue.insuranceNote}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28 xl:px-0">
        {result.status === "available" && result.trainings.length > 0 ? (
          <>
            <ul className="grid gap-px border border-[var(--wb-rule)] bg-[var(--wb-rule)] md:grid-cols-2 xl:grid-cols-3">
              {result.trainings.map((training) => (
                <li
                  key={training.slug}
                  className="flex min-w-0 flex-col bg-[var(--wb-paper)] p-6 sm:p-8"
                >
                  <p className="wb-kicker">{catalogue.programmeLabel}</p>
                  <h2 className="mt-7 break-words text-3xl leading-tight font-medium tracking-tight text-[var(--wb-green-deep)]">
                    {training.title}
                  </h2>
                  {training.summary ? (
                    <p className="mt-5 leading-7 text-[var(--wb-muted)]">{training.summary}</p>
                  ) : null}
                  <dl className="mt-8 space-y-4 border-t border-[var(--wb-rule)] pt-6 text-sm leading-6">
                    <div>
                      <dt className="wb-kicker uppercase">{catalogue.domainLabel}</dt>
                      <dd className="mt-1 text-[var(--wb-ink)]">{training.domain.name}</dd>
                    </div>
                    <div>
                      <dt className="wb-kicker uppercase">{catalogue.topicLabel}</dt>
                      <dd className="mt-1 text-[var(--wb-ink)]">{training.topic.name}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex flex-wrap gap-x-6 gap-y-4 pt-8">
                    <Link
                      className="wb-focus wb-text-link"
                      href={`${catalogueHref(locale, 1)}/${encodeURIComponent(training.slug)}`}
                    >
                      {catalogue.detailLabel}
                      <span aria-hidden="true" className="ml-2">
                        →
                      </span>
                    </Link>
                    <a
                      className="wb-focus wb-text-link"
                      href={WHATSAPP_CONTACT_URL}
                      aria-label={`${catalogue.enquiryLabel}: ${training.title}`}
                    >
                      {catalogue.enquiryLabel}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              locale={locale}
              page={page}
              hasNextPage={result.hasNextPage}
              previousLabel={catalogue.previousPage}
              nextLabel={catalogue.nextPage}
              pageLabel={catalogue.pageLabel}
            />
          </>
        ) : null}

        {result.status === "available" && result.trainings.length === 0 ? (
          <div className="max-w-2xl border-l-2 border-[var(--wb-green)] pl-6">
            <h2 className="wb-editorial text-4xl leading-tight font-medium">
              {catalogue.emptyTitle}
            </h2>
            <p className="mt-5 text-lg leading-8 text-[var(--wb-muted)]">
              {catalogue.emptyDescription}
            </p>
          </div>
        ) : null}

        {result.status === "unavailable" ? (
          <div role="status" className="max-w-2xl border-l-2 border-[var(--wb-green)] pl-6">
            <h2 className="wb-editorial text-4xl leading-tight font-medium">
              {catalogue.unavailableTitle}
            </h2>
            <p className="mt-5 text-lg leading-8 text-[var(--wb-muted)]">
              {catalogue.unavailableDescription}
            </p>
          </div>
        ) : null}
      </section>

      <section className="bg-[var(--wb-paper)] py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 xl:px-0">
          <div className="max-w-3xl">
            <p className="wb-kicker">{catalogue.contactEyebrow}</p>
            <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
              {catalogue.contactTitle}
            </h2>
            <p className="mt-6 text-lg leading-8 text-[var(--wb-muted)]">
              {catalogue.contactDescription}
            </p>
            <a
              className="wb-focus mt-8 inline-flex min-h-11 items-center bg-[var(--wb-green-deep)] px-5 text-sm font-medium text-white"
              href={WHATSAPP_CONTACT_URL}
            >
              {catalogue.contactCta}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function Pagination({
  locale,
  page,
  hasNextPage,
  previousLabel,
  nextLabel,
  pageLabel,
}: {
  locale: PublicLocale;
  page: number;
  hasNextPage: boolean;
  previousLabel: string;
  nextLabel: string;
  pageLabel: string;
}) {
  if (page === 1 && !hasNextPage) {
    return null;
  }

  return (
    <nav className="mt-10 flex items-center justify-between gap-4" aria-label={pageLabel}>
      {page > 1 ? (
        <Link className="wb-focus wb-text-link" href={catalogueHref(locale, page - 1)}>
          <span aria-hidden="true" className="mr-2">
            ←
          </span>
          {previousLabel}
        </Link>
      ) : (
        <span />
      )}
      <span className="wb-mono text-xs tracking-[0.12em] text-[var(--wb-muted)]">
        {pageLabel} {page}
      </span>
      {hasNextPage ? (
        <Link className="wb-focus wb-text-link" href={catalogueHref(locale, page + 1)}>
          {nextLabel}
          <span aria-hidden="true" className="ml-2">
            →
          </span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
