import Image from "next/image";
import Link from "next/link";

import { Breadcrumbs } from "../../_components/breadcrumbs";
import { TrainingDomainList } from "../../_components/training-domain-list";
import { ServicesCta } from "./services-cta";
import type { PublicDictionary } from "@/lib/public/content";
import type { PublicLocale } from "@/lib/public/locale";
import { publicHref } from "@/lib/public/locale";
import {
  getServiceContent,
  primaryServiceSlug,
  serviceHref,
  serviceImages,
  serviceSlugs,
  servicesHref,
  type ServiceSlug,
} from "@/lib/public/services";

export function ServiceDetail({
  locale,
  slug,
  dictionary,
}: {
  locale: PublicLocale;
  slug: ServiceSlug;
  dictionary: PublicDictionary;
}) {
  const services = dictionary.services;
  const labels = services.detail;
  const service = getServiceContent(dictionary, slug);
  const image = serviceImages[slug];
  const otherSlugs = serviceSlugs.filter((otherSlug) => otherSlug !== slug);

  return (
    <>
      <section className="overflow-hidden bg-[var(--wb-green-deep)] text-white">
        <div className="mx-auto grid max-w-7xl lg:grid-cols-[1.05fr_0.95fr]">
          <div className="px-5 pt-10 pb-16 sm:px-8 lg:pb-24 lg:pl-12 xl:pl-0">
            <Breadcrumbs
              label={services.breadcrumbLabel}
              tone="dark"
              items={[
                { label: services.homeLabel, href: publicHref(locale) },
                { label: dictionary.servicesNav, href: servicesHref(locale) },
                { label: service.name },
              ]}
            />
            <h1 className="mt-14">
              <span className="wb-mono block text-xs tracking-[0.18em] text-[#c9d8c8] uppercase">
                {service.name}
              </span>{" "}
              <span className="wb-editorial mt-7 block max-w-3xl text-5xl leading-[1.02] font-medium sm:text-6xl">
                {service.heroTitle}
              </span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-[#e2ece1]">
              {service.heroDescription}
            </p>
          </div>
          <div className="relative min-h-[300px] border-t border-white/20 sm:min-h-[380px] lg:min-h-0 lg:border-t-0 lg:border-l">
            <Image
              src={image.src}
              alt={service.imageAlt}
              fill
              loading="eager"
              sizes="(max-width: 1023px) 100vw, 48vw"
              className="object-cover"
              style={{ objectPosition: image.position }}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28 xl:px-0">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <p className="wb-kicker">{labels.explanationEyebrow}</p>
            <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
              {service.explanationTitle}
            </h2>
          </div>
          <div className="space-y-6 text-lg leading-8 text-[var(--wb-muted)] lg:pt-12">
            {service.explanation.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      {slug === primaryServiceSlug ? (
        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28 xl:px-0">
          <p className="wb-kicker">{dictionary.trainingDomains.eyebrow}</p>
          <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
            {dictionary.trainingDomains.title}
          </h2>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--wb-muted)]">
            {dictionary.trainingDomains.description}
          </p>
          <div className="mt-12">
            <TrainingDomainList dictionary={dictionary.trainingDomains} />
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-6 text-[var(--wb-muted)]">
            {dictionary.trainingDomains.note}
          </p>
        </section>
      ) : null}

      <section className="bg-[var(--wb-paper)] py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-16 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20 xl:px-0">
          <div>
            <p className="wb-kicker">{labels.needsEyebrow}</p>
            <h2 className="mt-5 text-3xl font-medium tracking-tight">{labels.needsTitle}</h2>
            <ul className="mt-8 border-t border-[var(--wb-rule)]">
              {service.needs.map((need) => (
                <li
                  key={need}
                  className="border-b border-[var(--wb-rule)] py-5 leading-7 text-[var(--wb-ink)]"
                >
                  {need}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="wb-kicker">{labels.areasEyebrow}</p>
            <h2 className="mt-5 text-3xl font-medium tracking-tight">{labels.areasTitle}</h2>
            <ul className="mt-8 flex flex-wrap gap-3">
              {service.areas.map((area) => (
                <li
                  key={area}
                  className="border border-[var(--wb-rule)] bg-[var(--wb-canvas)] px-4 py-3 text-sm leading-6"
                >
                  {area}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-6 text-[var(--wb-muted)]">{labels.areasNote}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28 xl:px-0">
        <p className="wb-kicker">{labels.approachEyebrow}</p>
        <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
          {labels.approachTitle}
        </h2>
        <ol className="mt-12 grid gap-px border border-[var(--wb-rule)] bg-[var(--wb-rule)] md:grid-cols-3">
          {service.approach.map((step, index) => (
            <li key={step.title} className="bg-[var(--wb-canvas)] p-7">
              <p
                className="wb-mono text-xs tracking-[0.16em] text-[var(--wb-green)]"
                aria-hidden="true"
              >
                0{index + 1}
              </p>
              <h3 className="mt-4 text-xl font-medium tracking-tight">{step.title}</h3>
              <p className="mt-3 leading-7 text-[var(--wb-muted)]">{step.description}</p>
            </li>
          ))}
        </ol>
        <div
          role="note"
          aria-label={labels.noticeLabel}
          className="mt-12 max-w-3xl border-l-2 border-[var(--wb-green)] bg-[var(--wb-green-soft)] px-6 py-5"
        >
          <p className="wb-kicker uppercase">{labels.noticeLabel}</p>
          <p className="mt-2 leading-7">{service.notice}</p>
        </div>
      </section>

      <ServicesCta
        eyebrow={service.name}
        title={service.ctaTitle}
        description={service.ctaDescription}
        label={service.ctaLabel}
      />

      <nav
        aria-label={labels.otherServicesTitle}
        className="mx-auto max-w-7xl px-5 pb-24 sm:px-8 xl:px-0"
      >
        <h2 className="wb-kicker uppercase">{labels.otherServicesTitle}</h2>
        <ul className="mt-6 grid gap-px border border-[var(--wb-rule)] bg-[var(--wb-rule)] md:grid-cols-3">
          {otherSlugs.map((otherSlug) => (
            <li key={otherSlug} className="bg-[var(--wb-paper)]">
              <Link
                className="wb-focus flex min-h-24 items-center justify-between gap-4 p-6 text-lg font-medium tracking-tight hover:bg-[var(--wb-green-soft)]"
                href={serviceHref(locale, otherSlug)}
              >
                {getServiceContent(dictionary, otherSlug).name}
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link className="wb-focus wb-text-link mt-10" href={servicesHref(locale)}>
          <span aria-hidden="true" className="mr-2">
            ←
          </span>
          {labels.backToServices}
        </Link>
      </nav>
    </>
  );
}
