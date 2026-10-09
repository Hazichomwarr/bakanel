import Image from "next/image";
import Link from "next/link";

import type { PublicDictionary } from "@/lib/public/content";
import type { PublicLocale } from "@/lib/public/locale";
import {
  complementaryServiceSlugs,
  getServiceContent,
  serviceHref,
  serviceImages,
  servicesHref,
} from "@/lib/public/services";

export function HomeComplementaryServices({
  locale,
  dictionary,
}: {
  locale: PublicLocale;
  dictionary: PublicDictionary;
}) {
  const home = dictionary.home;

  return (
    <section className="bg-[var(--wb-paper)] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 xl:px-0">
        <div className="max-w-3xl">
          <p className="wb-kicker">{home.complementaryEyebrow}</p>
          <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
            {home.complementaryTitle}
          </h2>
          <p className="mt-6 text-lg leading-8 text-[var(--wb-muted)]">
            {home.complementaryDescription}
          </p>
        </div>
        <ul className="mt-14 grid gap-px overflow-hidden border border-[var(--wb-rule)] bg-[var(--wb-rule)] md:grid-cols-3">
          {complementaryServiceSlugs.map((slug) => {
            const service = getServiceContent(dictionary, slug);
            const image = serviceImages[slug];

            return (
              <li key={slug} className="group relative bg-[var(--wb-paper)] p-5 sm:p-7">
                <div className="relative aspect-[1.45] overflow-hidden bg-[var(--wb-green-soft)]">
                  <Image
                    src={image.src}
                    alt={service.imageAlt}
                    fill
                    sizes="(max-width: 767px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 motion-reduce:transition-none sm:group-hover:scale-[1.03]"
                    style={{ objectPosition: image.position }}
                  />
                </div>
                <h3 className="mt-6 text-2xl font-medium tracking-tight">
                  <Link
                    className="wb-focus after:absolute after:inset-0 group-hover:text-[var(--wb-green)]"
                    href={serviceHref(locale, slug)}
                  >
                    {service.name}
                    <span aria-hidden="true" className="ml-2 text-[var(--wb-green)]">
                      →
                    </span>
                  </Link>
                </h3>
                <p className="mt-3 leading-7 text-[var(--wb-muted)]">{service.summary}</p>
              </li>
            );
          })}
        </ul>
        <Link className="wb-focus wb-text-link mt-10" href={servicesHref(locale)}>
          {home.complementaryOverviewCta}
        </Link>
      </div>
    </section>
  );
}
