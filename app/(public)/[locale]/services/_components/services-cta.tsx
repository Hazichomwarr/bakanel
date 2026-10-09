import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";

export function ServicesCta({
  eyebrow,
  title,
  description,
  label,
}: {
  eyebrow: string;
  title: string;
  description: string;
  label: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28 xl:px-0">
      <div className="border-y border-[var(--wb-ink)] py-12 sm:grid sm:grid-cols-[1fr_auto] sm:items-end sm:gap-10 sm:py-16">
        <div className="max-w-3xl">
          <p className="wb-kicker uppercase">{eyebrow}</p>
          <h2 className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl">
            {title}
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--wb-muted)]">{description}</p>
        </div>
        <a
          className="wb-focus wb-button-dark mt-10 w-full justify-center sm:mt-0 sm:w-auto"
          href={WHATSAPP_CONTACT_URL}
        >
          {label}
        </a>
      </div>
    </section>
  );
}
