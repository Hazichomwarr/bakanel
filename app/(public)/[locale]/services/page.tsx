import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "../_components/breadcrumbs";
import { ServicesCta } from "./_components/services-cta";
import { dictionaries } from "@/lib/public/content";
import { isPublicLocale, publicHref } from "@/lib/public/locale";
import { localizedAlternates } from "@/lib/public/seo";
import {
  complementaryServiceSlugs,
  getServiceContent,
  primaryServiceSlug,
  serviceHref,
  serviceImages,
  servicesHref,
  servicesOverviewMetadata,
} from "@/lib/public/services";
import { priorityTrainingDomain, trainingDomainKeys } from "@/lib/public/training-domains";

type ServicesOverviewProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ServicesOverviewProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isPublicLocale(locale)) {
    return {};
  }

  return {
    ...servicesOverviewMetadata(dictionaries[locale]),
    alternates: localizedAlternates(servicesHref, locale),
  };
}

export default async function ServicesOverviewPage({ params }: ServicesOverviewProps) {
  const { locale } = await params;

  if (!isPublicLocale(locale)) {
    notFound();
  }

  const dictionary = dictionaries[locale];
  const services = dictionary.services;
  const overview = services.overview;
  const trainingDomains = dictionary.trainingDomains;
  const primaryService = getServiceContent(dictionary, primaryServiceSlug);
  const primaryImage = serviceImages[primaryServiceSlug];

  return (
    <>
      <section className="bg-[var(--wb-green-deep)] text-white">
        <div className="mx-auto max-w-7xl px-5 pt-10 pb-20 sm:px-8 lg:pb-28 xl:px-0">
          <Breadcrumbs
            label={services.breadcrumbLabel}
            tone="dark"
            items={[
              { label: services.homeLabel, href: publicHref(locale) },
              { label: dictionary.servicesNav },
            ]}
          />
          <p className="wb-mono mt-14 text-xs tracking-[0.18em] text-[#c9d8c8]">
            {overview.eyebrow}
          </p>
          <h1 className="wb-editorial mt-7 max-w-4xl text-5xl leading-[1.02] font-medium sm:text-6xl lg:text-7xl">
            {overview.title}
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#e2ece1]">{overview.description}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28 xl:px-0">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <p className="wb-kicker">{overview.positioningEyebrow}</p>
            <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
              {overview.positioningTitle}
            </h2>
          </div>
          <div className="space-y-6 text-lg leading-8 text-[var(--wb-muted)] lg:pt-12">
            {overview.positioning.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--wb-paper)] py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 xl:px-0">
          <p className="wb-kicker">{overview.primaryEyebrow}</p>
          <article className="mt-8 grid border border-[var(--wb-rule)] bg-[var(--wb-paper)] lg:grid-cols-[0.95fr_1.05fr]">
            <div className="relative aspect-[1.6] overflow-hidden bg-[var(--wb-green-soft)] lg:aspect-auto">
              <Image
                src={primaryImage.src}
                alt={primaryService.imageAlt}
                fill
                sizes="(max-width: 1023px) 100vw, 46vw"
                className="object-cover"
                style={{ objectPosition: primaryImage.position }}
              />
            </div>
            <div className="flex flex-col p-5 sm:p-10">
              <h2 className="wb-editorial text-4xl leading-tight font-medium sm:text-5xl">
                {primaryService.name}
              </h2>
              <p className="mt-5 text-lg leading-8 text-[var(--wb-muted)]">
                {primaryService.summary}
              </p>
              <h3 className="wb-kicker mt-8 uppercase">{overview.domainsLabel}</h3>
              <ul className="mt-4 border-t border-[var(--wb-rule)]">
                {trainingDomainKeys.map((key) => (
                  <li
                    key={key}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--wb-rule)] py-4"
                  >
                    <span
                      className={
                        key === priorityTrainingDomain
                          ? "text-2xl font-medium tracking-tight text-[var(--wb-green-deep)]"
                          : "text-lg font-medium tracking-tight"
                      }
                    >
                      {trainingDomains.items[key].name}
                    </span>
                    {key === priorityTrainingDomain ? (
                      <span className="wb-mono text-xs tracking-[0.12em] text-[var(--wb-green)] uppercase">
                        {trainingDomains.priorityLabel}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Link
                  className="wb-focus wb-text-link"
                  href={serviceHref(locale, primaryServiceSlug)}
                >
                  {overview.linkLabel}
                  <span className="sr-only">, {primaryService.name}</span>
                  <span aria-hidden="true" className="ml-2">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28 xl:px-0">
        <p className="wb-kicker">{overview.complementaryEyebrow}</p>
        <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
          {overview.complementaryTitle}
        </h2>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--wb-muted)]">
          {overview.complementaryDescription}
        </p>
        <ul className="mt-14 grid gap-px border border-[var(--wb-rule)] bg-[var(--wb-rule)] lg:grid-cols-3">
          {complementaryServiceSlugs.map((slug) => {
            const service = getServiceContent(dictionary, slug);
            const image = serviceImages[slug];

            return (
              <li key={slug} className="flex flex-col bg-[var(--wb-paper)] p-5 sm:p-8">
                <div className="relative aspect-[1.6] overflow-hidden bg-[var(--wb-green-soft)]">
                  <Image
                    src={image.src}
                    alt={service.imageAlt}
                    fill
                    sizes="(max-width: 1023px) 100vw, 33vw"
                    className="object-cover"
                    style={{ objectPosition: image.position }}
                  />
                </div>
                <h3 className="mt-7 text-2xl font-medium tracking-tight">{service.name}</h3>
                <p className="mt-4 leading-7 text-[var(--wb-muted)]">{service.summary}</p>
                <dl className="mt-6 space-y-4 border-t border-[var(--wb-rule)] pt-6 text-sm leading-6">
                  <div>
                    <dt className="wb-kicker uppercase">{overview.audienceLabel}</dt>
                    <dd className="mt-1 text-[var(--wb-ink)]">{service.audience}</dd>
                  </div>
                  <div>
                    <dt className="wb-kicker uppercase">{overview.supportLabel}</dt>
                    <dd className="mt-1 text-[var(--wb-ink)]">{service.support}</dd>
                  </div>
                </dl>
                <div className="mt-auto pt-8">
                  <Link className="wb-focus wb-text-link" href={serviceHref(locale, slug)}>
                    {overview.linkLabel}
                    <span className="sr-only">, {service.name}</span>
                    <span aria-hidden="true" className="ml-2">
                      →
                    </span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <ServicesCta
        eyebrow={overview.ctaEyebrow}
        title={overview.ctaTitle}
        description={overview.ctaDescription}
        label={overview.ctaLabel}
      />
    </>
  );
}
