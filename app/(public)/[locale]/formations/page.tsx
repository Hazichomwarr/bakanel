import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";
import { dictionaries } from "@/lib/public/content";
import type { PublicTrainingCatalogueFilter, PublicTrainingDto } from "@/lib/public/dto";
import { isPublicLocale, publicLocales, publicHref, type PublicLocale } from "@/lib/public/locale";
import {
  publicTrainingReader,
  type PublicTrainingCatalogueFilterInput,
} from "@/lib/public/training.read";
import { trainingCatalogueHref, trainingDetailHref } from "@/lib/public/training-routes";

const PAGE_SIZE = 12;
const LOOKAHEAD_LIMIT = PAGE_SIZE + 1;

type CataloguePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    domain?: string | string[];
    page?: string | string[];
    topic?: string | string[];
  }>;
};

type CatalogueResult =
  | {
      status: "available";
      trainings: PublicTrainingDto[];
      hasNextPage: boolean;
      filter: PublicTrainingCatalogueFilter | null;
    }
  | { status: "filtered-empty" }
  | { status: "unavailable" };

type CatalogueFilterRequest = PublicTrainingCatalogueFilterInput | "invalid" | null;

function parsePage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return 1;
  }

  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function catalogueHref(
  locale: PublicLocale,
  page: number,
  filter: PublicTrainingCatalogueFilterInput | null = null,
) {
  const pathname = `${publicHref(locale)}/formations`;
  const searchParams = new URLSearchParams();

  if (filter) {
    searchParams.set(filter.kind, filter.slug);
  }
  if (page > 1) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Only one taxonomy scope may be selected at once. Supplying both query parameters is invalid
 * and fails closed rather than letting either one silently override the other.
 */
function parseCatalogueFilter({
  domain,
  topic,
}: {
  domain: string | string[] | undefined;
  topic: string | string[] | undefined;
}): CatalogueFilterRequest {
  if (domain !== undefined && topic !== undefined) {
    return "invalid";
  }

  const selected = domain ?? topic;
  if (selected === undefined) {
    return null;
  }
  if (typeof selected !== "string") {
    return "invalid";
  }

  const slug = selected.trim();
  if (!slug) {
    return "invalid";
  }

  return { kind: domain !== undefined ? "domain" : "topic", slug };
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

async function getCatalogue(
  locale: PublicLocale,
  page: number,
  requestedFilter: CatalogueFilterRequest,
): Promise<CatalogueResult> {
  try {
    if (requestedFilter === "invalid") {
      return { status: "filtered-empty" };
    }

    const filter = requestedFilter
      ? await publicTrainingReader.getPublicTrainingCatalogueFilter(locale, requestedFilter)
      : null;

    if (requestedFilter && !filter) {
      return { status: "filtered-empty" };
    }

    const results = await publicTrainingReader.listPublicTrainings(locale, {
      offset: (page - 1) * PAGE_SIZE,
      limit: LOOKAHEAD_LIMIT,
      ...(filter ? { filter } : {}),
    });

    return {
      status: "available",
      trainings: results.slice(0, PAGE_SIZE),
      hasNextPage: results.length > PAGE_SIZE,
      filter,
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
    alternates: {
      canonical: trainingCatalogueHref(locale),
      languages: Object.fromEntries(
        publicLocales.map((targetLocale) => [targetLocale, trainingCatalogueHref(targetLocale)]),
      ),
    },
  };
}

export default async function TrainingCataloguePage({ params, searchParams }: CataloguePageProps) {
  const { locale } = await params;

  if (!isPublicLocale(locale)) {
    notFound();
  }

  const { domain, page: requestedPage, topic } = await searchParams;
  const page = parsePage(requestedPage);
  const requestedFilter = parseCatalogueFilter({ domain, topic });
  const dictionary = dictionaries[locale];
  const catalogue = dictionary.trainingCatalogue;
  const result = await getCatalogue(locale, page, requestedFilter);

  // A later page may become empty after concurrent archival or a stale shared link. Returning
  // visitors to the first page avoids presenting that bounded page as an empty catalogue.
  if (result.status === "available" && result.trainings.length === 0 && page > 1) {
    redirect(catalogueHref(locale, 1, result.filter));
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
            {result.filter ? (
              <p className="mb-8 border-l-2 border-[var(--wb-green)] pl-5 text-sm leading-6 text-[var(--wb-muted)]">
                {catalogue.filteredByLabel}:{" "}
                <span className="font-medium text-[var(--wb-ink)]">
                  {result.filter.kind === "domain" ? catalogue.domainLabel : catalogue.topicLabel} —{" "}
                  {result.filter.name}
                </span>
              </p>
            ) : null}
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
                      href={trainingDetailHref(locale, training.slug)}
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
              filter={result.filter}
              previousLabel={catalogue.previousPage}
              nextLabel={catalogue.nextPage}
              pageLabel={catalogue.pageLabel}
            />
          </>
        ) : null}

        {result.status === "available" && result.trainings.length === 0 ? (
          <div className="max-w-2xl border-l-2 border-[var(--wb-green)] pl-6">
            {result.filter ? (
              <p className="wb-kicker mb-5">
                {catalogue.filteredByLabel}:{" "}
                {result.filter.kind === "domain" ? catalogue.domainLabel : catalogue.topicLabel} —{" "}
                {result.filter.name}
              </p>
            ) : null}
            <h2 className="wb-editorial text-4xl leading-tight font-medium">
              {result.filter ? catalogue.filteredEmptyTitle : catalogue.emptyTitle}
            </h2>
            <p className="mt-5 text-lg leading-8 text-[var(--wb-muted)]">
              {result.filter ? catalogue.filteredEmptyDescription : catalogue.emptyDescription}
            </p>
            {result.filter ? (
              <Link
                className="wb-focus wb-text-link mt-6 inline-flex"
                href={catalogueHref(locale, 1)}
              >
                {catalogue.allProgrammesLabel}
              </Link>
            ) : null}
          </div>
        ) : null}

        {result.status === "filtered-empty" ? (
          <div className="max-w-2xl border-l-2 border-[var(--wb-green)] pl-6">
            <h2 className="wb-editorial text-4xl leading-tight font-medium">
              {catalogue.filteredEmptyTitle}
            </h2>
            <p className="mt-5 text-lg leading-8 text-[var(--wb-muted)]">
              {catalogue.filteredEmptyDescription}
            </p>
            <Link
              className="wb-focus wb-text-link mt-6 inline-flex"
              href={catalogueHref(locale, 1)}
            >
              {catalogue.allProgrammesLabel}
            </Link>
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
  filter,
  previousLabel,
  nextLabel,
  pageLabel,
}: {
  locale: PublicLocale;
  page: number;
  hasNextPage: boolean;
  filter: PublicTrainingCatalogueFilter | null;
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
        <Link className="wb-focus wb-text-link" href={catalogueHref(locale, page - 1, filter)}>
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
        <Link className="wb-focus wb-text-link" href={catalogueHref(locale, page + 1, filter)}>
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
