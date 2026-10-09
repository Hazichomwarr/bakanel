import Link from "next/link";

import { TrainingDomainList } from "./training-domain-list";
import type { HomeDictionary, TrainingDomainsDictionary } from "@/lib/public/content";
import type { PublicLocale } from "@/lib/public/locale";
import { primaryServiceSlug, serviceHref } from "@/lib/public/services";

/** Anchor targeted by the hero's training CTA until a public catalogue route exists. */
export const HOME_TRAINING_SECTION_ID = "formations";

export function HomeTrainingDomains({
  locale,
  dictionary,
  domains,
}: {
  locale: PublicLocale;
  dictionary: HomeDictionary;
  domains: TrainingDomainsDictionary;
}) {
  return (
    <section
      id={HOME_TRAINING_SECTION_ID}
      className="mx-auto max-w-7xl scroll-mt-6 px-5 py-24 sm:px-8 lg:py-32 xl:px-0"
    >
      <div className="max-w-3xl">
        <p className="wb-kicker">{domains.eyebrow}</p>
        <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
          {domains.title}
        </h2>
        <p className="mt-6 text-lg leading-8 text-[var(--wb-muted)]">{domains.description}</p>
      </div>
      <div className="mt-14">
        <TrainingDomainList dictionary={domains} />
      </div>
      <p className="mt-6 max-w-3xl text-sm leading-6 text-[var(--wb-muted)]">{domains.note}</p>
      <Link className="wb-focus wb-text-link mt-10" href={serviceHref(locale, primaryServiceSlug)}>
        {dictionary.domainsDetailCta}
      </Link>
    </section>
  );
}
