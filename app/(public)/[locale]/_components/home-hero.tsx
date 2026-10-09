import Image from "next/image";

import type { HomeDictionary } from "@/lib/public/content";
import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";
import { HOME_TRAINING_SECTION_ID } from "./home-training-domains";

export function HomeHero({ dictionary }: { dictionary: HomeDictionary }) {
  return (
    <section className="overflow-hidden bg-[var(--wb-green-deep)] text-white">
      <div className="mx-auto grid min-h-[660px] max-w-7xl items-stretch lg:grid-cols-[1.06fr_0.94fr]">
        <div className="flex flex-col justify-center px-5 py-20 sm:px-8 lg:px-12 xl:px-16">
          <p className="wb-mono text-xs tracking-[0.18em] text-[#c9d8c8]">{dictionary.eyebrow}</p>
          <h1 className="wb-editorial mt-7 max-w-3xl text-5xl leading-[0.98] font-medium sm:text-6xl lg:text-7xl">
            {dictionary.heroTitle}
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-[#e2ece1]">
            {dictionary.heroDescription}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a className="wb-focus wb-button-light" href={`#${HOME_TRAINING_SECTION_ID}`}>
              {dictionary.trainingCta}
            </a>
            <a className="wb-focus wb-button-quiet" href={WHATSAPP_CONTACT_URL}>
              {dictionary.heroContactCta}
            </a>
          </div>
        </div>
        <div className="relative min-h-[340px] border-t border-white/20 lg:min-h-0 lg:border-t-0 lg:border-l">
          <Image
            src="/images/training.png"
            alt=""
            fill
            loading="eager"
            sizes="(max-width: 1023px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(10,35,28,0.12),rgba(10,35,28,0.4))]" />
        </div>
      </div>
    </section>
  );
}
