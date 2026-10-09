import type { HomeDictionary } from "@/lib/public/content";
import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";

export function HomeContactCta({ dictionary }: { dictionary: HomeDictionary }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32 xl:px-0">
      <div className="border-y border-[var(--wb-ink)] py-12 sm:grid sm:grid-cols-[1fr_auto] sm:items-end sm:gap-10 sm:py-16">
        <div className="max-w-3xl">
          <p className="wb-kicker">{dictionary.contactEyebrow}</p>
          <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-6xl">
            {dictionary.contactTitle}
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--wb-muted)]">
            {dictionary.contactDescription}
          </p>
        </div>
        <a className="wb-focus wb-button-dark mt-10 sm:mt-0" href={WHATSAPP_CONTACT_URL}>
          {dictionary.contactCta}
        </a>
      </div>
    </section>
  );
}
