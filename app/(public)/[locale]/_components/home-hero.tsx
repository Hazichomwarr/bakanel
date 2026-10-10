import Image from "next/image";
import Link from "next/link";

import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";
import type { HomeDictionary } from "@/lib/public/content";
import type { PublicLocale } from "@/lib/public/locale";
import { trainingCatalogueHref } from "@/lib/public/training-routes";

export function HomeHero({
  locale,
  dictionary,
}: {
  locale: PublicLocale;
  dictionary: HomeDictionary;
}) {
  return (
    <section className="bg-[var(--wb-green-deep)] text-white">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20 xl:px-16">
        <div className="max-w-3xl">
          <p className="wb-mono text-xs tracking-[0.18em] text-[#c9d8c8]">{dictionary.eyebrow}</p>
          <h1 className="wb-editorial mt-5 text-[clamp(2.625rem,11vw,3.5rem)] leading-[1.02] font-medium sm:mt-6 sm:text-6xl lg:text-7xl">
            {dictionary.heroTitle}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#e2ece1] sm:text-lg sm:leading-8">
            {dictionary.heroDescription}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <Link className="wb-focus wb-button-light" href={trainingCatalogueHref(locale)}>
              {dictionary.trainingCta}
            </Link>
            <a className="wb-focus wb-button-quiet" href={WHATSAPP_CONTACT_URL}>
              {dictionary.heroContactCta}
            </a>
          </div>
        </div>
      </div>
      <div className="relative aspect-[4/3] w-full sm:aspect-[3/2] lg:aspect-[2/1]">
        <Image
          src="/images/hero.png"
          alt={dictionary.heroImageAlt}
          fill
          loading="eager"
          sizes="100vw"
          className="object-cover object-[50%_52%]"
        />
      </div>
    </section>
  );
}
