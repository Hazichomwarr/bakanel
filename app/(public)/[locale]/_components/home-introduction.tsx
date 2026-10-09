import Image from "next/image";

import type { HomeDictionary } from "@/lib/public/content";

export function HomeIntroduction({ dictionary }: { dictionary: HomeDictionary }) {
  return (
    <section id="a-propos" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32 xl:px-0">
      <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="relative aspect-[1.2] overflow-hidden bg-[var(--wb-green-soft)]">
          <Image
            src="/images/ki-sommes-nous.png"
            alt=""
            fill
            sizes="(max-width: 1023px) 100vw, 42vw"
            className="object-cover"
          />
        </div>
        <div className="max-w-2xl">
          <p className="wb-kicker">{dictionary.introductionEyebrow}</p>
          <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
            {dictionary.introductionTitle}
          </h2>
          <p className="mt-7 text-lg leading-8 text-[var(--wb-muted)]">
            {dictionary.introductionDescription}
          </p>
        </div>
      </div>
    </section>
  );
}
