import { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";
import { dictionaries } from "@/lib/public/content";
import type { PublicTrainingAlternateDto, PublicTrainingDetailDto } from "@/lib/public/dto";
import { isPublicLocale, publicLocales, type PublicLocale } from "@/lib/public/locale";
import { publicSessionReader } from "@/lib/public/session.read";
import {
  formatPublicDateRange,
  formatPublicSessionDelivery,
  formatPublicSessionPrice,
} from "@/lib/public/training-presentation";
import { publicTrainingReader } from "@/lib/public/training.read";
import { trainingCatalogueHref, trainingDetailHref } from "@/lib/public/training-routes";

type TrainingDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

type TrainingResult =
  | { status: "available"; training: PublicTrainingDetailDto | null }
  | { status: "unavailable" };

type SessionResult =
  | {
      status: "available";
      sessions: Awaited<
        ReturnType<typeof publicSessionReader.listPublicUpcomingSessionsForTraining>
      >;
    }
  | { status: "unavailable" };

type AlternateResult =
  | { status: "available"; alternates: PublicTrainingAlternateDto[] }
  | { status: "unavailable" };

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

async function getTraining(locale: PublicLocale, slug: string): Promise<TrainingResult> {
  try {
    const training = await publicTrainingReader.getPublicTrainingBySlug(locale, slug);
    return training ? { status: "available", training } : { status: "available", training: null };
  } catch (error) {
    if (!isOperationalDatabaseError(error)) {
      throw error;
    }

    console.error(`Public training detail unavailable (${operationalErrorLabel(error)}).`);
    return { status: "unavailable" };
  }
}

async function getSessions(locale: PublicLocale, slug: string): Promise<SessionResult> {
  try {
    const sessions = await publicSessionReader.listPublicUpcomingSessionsForTraining(locale, slug);
    return { status: "available", sessions };
  } catch (error) {
    if (!isOperationalDatabaseError(error)) {
      throw error;
    }

    console.error(`Public training sessions unavailable (${operationalErrorLabel(error)}).`);
    return { status: "unavailable" };
  }
}

async function getAlternates(locale: PublicLocale, slug: string): Promise<AlternateResult> {
  try {
    const alternates = await publicTrainingReader.listPublicTrainingAlternates(locale, slug);
    return { status: "available", alternates };
  } catch (error) {
    if (!isOperationalDatabaseError(error)) {
      throw error;
    }

    console.error(`Public training alternates unavailable (${operationalErrorLabel(error)}).`);
    return { status: "unavailable" };
  }
}

function trainingLocaleTargets(
  locale: PublicLocale,
  slug: string,
  alternates: PublicTrainingAlternateDto[],
) {
  const targets = Object.fromEntries(
    publicLocales.map((target) => [target, trainingCatalogueHref(target)]),
  ) as Record<PublicLocale, string>;

  targets[locale] = trainingDetailHref(locale, slug);

  for (const alternate of alternates) {
    targets[alternate.locale] = trainingDetailHref(alternate.locale, alternate.slug);
  }

  return targets;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: TrainingDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;

  if (!isPublicLocale(locale)) {
    return {};
  }

  const result = await getTraining(locale, slug);
  if (result.status !== "available" || !result.training) {
    return {};
  }

  const training = result.training;
  const dictionary = dictionaries[locale].trainingDetail;
  const alternateResult = await getAlternates(locale, training.slug);
  const alternates = alternateResult.status === "available" ? alternateResult.alternates : [];
  const targets = trainingLocaleTargets(locale, training.slug, alternates);

  return {
    title: `${training.title} | W'BAKENEL Consulting Institute`,
    description: training.summary ?? training.description ?? dictionary.metadataDescription,
    alternates: {
      canonical: trainingDetailHref(locale, training.slug),
      languages: Object.fromEntries(
        Object.entries(targets).filter(
          ([target]) =>
            target === locale || alternates.some((alternate) => alternate.locale === target),
        ),
      ),
    },
  };
}

export default async function TrainingDetailPage({ params }: TrainingDetailPageProps) {
  const { locale, slug } = await params;

  if (!isPublicLocale(locale)) {
    notFound();
  }

  const trainingResult = await getTraining(locale, slug);
  if (trainingResult.status === "unavailable") {
    return <UnavailableTrainingPage locale={locale} />;
  }

  if (!trainingResult.training) {
    notFound();
  }

  const training = trainingResult.training;
  const dictionary = dictionaries[locale];
  const detail = dictionary.trainingDetail;
  const [sessions, alternateResult] = await Promise.all([
    getSessions(locale, training.slug),
    getAlternates(locale, training.slug),
  ]);
  const alternates = alternateResult.status === "available" ? alternateResult.alternates : [];
  const targets = trainingLocaleTargets(locale, training.slug, alternates);

  return (
    <>
      <TrainingLocaleTargets targets={targets} />
      <section className="bg-[var(--wb-green-deep)] text-white">
        <div className="mx-auto max-w-7xl px-5 pt-10 pb-20 sm:px-8 lg:pb-28 xl:px-0">
          <Link
            className="wb-focus wb-mono text-xs tracking-[0.12em] text-[#c9d8c8]"
            href={trainingCatalogueHref(locale)}
          >
            ← {detail.backToCatalogue}
          </Link>
          <p className="wb-mono mt-14 text-xs tracking-[0.18em] text-[#c9d8c8]">
            {detail.programmeLabel}
          </p>
          <h1 className="wb-editorial mt-7 max-w-4xl break-words text-5xl leading-[1.02] font-medium sm:text-6xl lg:text-7xl">
            {training.title}
          </h1>
          {training.summary ? (
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[#e2ece1]">{training.summary}</p>
          ) : null}
          <dl className="mt-10 grid max-w-2xl gap-6 border-t border-white/20 pt-6 sm:grid-cols-2">
            <div>
              <dt className="wb-kicker text-[#c9d8c8] uppercase">{detail.domainLabel}</dt>
              <dd className="mt-2 text-lg">{training.domain.name}</dd>
            </div>
            <div>
              <dt className="wb-kicker text-[#c9d8c8] uppercase">{detail.topicLabel}</dt>
              <dd className="mt-2 text-lg">{training.topic.name}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-20 sm:px-8 lg:py-28 xl:px-0">
        <div className="space-y-14">
          <ContentSection label={detail.descriptionLabel} content={training.description} />
          <ContentSection label={detail.objectivesLabel} content={training.objectives} />
          <ContentSection label={detail.audienceLabel} content={training.targetAudience} />
          <ContentSection label={detail.programmeContentLabel} content={training.program} />
        </div>
      </section>

      <section className="bg-[var(--wb-paper)] py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 xl:px-0">
          <p className="wb-kicker">{detail.sessionsEyebrow}</p>
          <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
            {detail.sessionsTitle}
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--wb-muted)]">
            {detail.sessionsDescription}
          </p>

          {sessions.status === "available" && sessions.sessions.length > 0 ? (
            <ul className="mt-12 grid gap-px border border-[var(--wb-rule)] bg-[var(--wb-rule)] lg:grid-cols-2">
              {sessions.sessions.map((session, index) => {
                const delivery = formatPublicSessionDelivery(session, detail);
                const price = formatPublicSessionPrice(locale, session, detail);

                return (
                  <li
                    key={`${session.trainingSlug}-${session.startDate.toISOString()}-${index}`}
                    className="bg-[var(--wb-paper)] p-6 sm:p-8"
                  >
                    <dl className="grid gap-6 text-sm leading-6 sm:grid-cols-2">
                      <SessionFact
                        label={detail.datesLabel}
                        value={formatPublicDateRange(locale, session.startDate, session.endDate)}
                      />
                      <SessionFact label={detail.deliveryLabel} value={delivery.delivery} />
                      <SessionFact label={detail.locationLabel} value={delivery.location} />
                      <SessionFact label={detail.priceLabel} value={price} />
                      <SessionFact
                        label={detail.registrationLabel}
                        value={
                          session.registrationOpen
                            ? detail.registrationOpen
                            : detail.registrationClosed
                        }
                      />
                    </dl>
                    <a
                      className="wb-focus wb-text-link mt-8 inline-flex"
                      href={WHATSAPP_CONTACT_URL}
                      aria-label={`${detail.sessionEnquiryLabel}: ${formatPublicDateRange(locale, session.startDate, session.endDate)}`}
                    >
                      {detail.sessionEnquiryLabel}
                      <span aria-hidden="true" className="ml-2">
                        →
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {sessions.status === "available" && sessions.sessions.length === 0 ? (
            <p className="mt-12 max-w-2xl border-l-2 border-[var(--wb-green)] pl-6 text-lg leading-8 text-[var(--wb-muted)]">
              {detail.sessionsEmpty}
            </p>
          ) : null}

          {sessions.status === "unavailable" ? (
            <p
              role="status"
              className="mt-12 max-w-2xl border-l-2 border-[var(--wb-green)] pl-6 text-lg leading-8 text-[var(--wb-muted)]"
            >
              {detail.sessionsUnavailable}
            </p>
          ) : null}
        </div>
      </section>

      <section className="bg-[var(--wb-green-deep)] py-20 text-white lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 xl:px-0">
          <div className="max-w-3xl">
            <p className="wb-kicker text-[#c9d8c8]">{detail.contactEyebrow}</p>
            <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
              {detail.contactTitle}
            </h2>
            <p className="mt-6 text-lg leading-8 text-[#d9e7d8]">{detail.contactDescription}</p>
            <a
              className="wb-focus mt-8 inline-flex min-h-11 items-center bg-white px-5 text-sm font-medium text-[var(--wb-green-deep)]"
              href={WHATSAPP_CONTACT_URL}
            >
              {detail.contactCta}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function ContentSection({ label, content }: { label: string; content: string | null }) {
  if (!content) {
    return null;
  }

  return (
    <section>
      <p className="wb-kicker">{label}</p>
      <p className="mt-5 whitespace-pre-line text-lg leading-8 text-[var(--wb-muted)]">{content}</p>
    </section>
  );
}

function UnavailableTrainingPage({ locale }: { locale: PublicLocale }) {
  const detail = dictionaries[locale].trainingDetail;

  return (
    <section className="mx-auto max-w-4xl px-5 py-20 sm:px-8 lg:py-28 xl:px-0">
      <div role="status" className="border-l-2 border-[var(--wb-green)] pl-6">
        <h1 className="wb-editorial text-4xl leading-tight font-medium">
          {detail.unavailableTitle}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--wb-muted)]">
          {detail.unavailableDescription}
        </p>
        <a className="wb-focus wb-text-link mt-8 inline-flex" href={WHATSAPP_CONTACT_URL}>
          {detail.contactCta}
          <span aria-hidden="true" className="ml-2">
            →
          </span>
        </a>
      </div>
    </section>
  );
}

function TrainingLocaleTargets({ targets }: { targets: Record<PublicLocale, string> }) {
  return <span hidden data-public-training-locale-targets={JSON.stringify(targets)} />;
}

function SessionFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="wb-kicker uppercase">{label}</dt>
      <dd className="mt-1 text-[var(--wb-ink)]">{value}</dd>
    </div>
  );
}
