import { notFound } from "next/navigation";

import { isPublicLocale } from "@/lib/public/locale";
import { dictionaries } from "@/lib/public/content";

export default async function PublicLocalePlaceholder({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  const dictionary = dictionaries[locale];

  return (
    <section className="mx-auto flex min-h-[65vh] max-w-6xl items-center px-5 py-20">
      <div className="max-w-3xl border-l border-[var(--wb-green)] pl-6">
        <p className="wb-mono text-xs tracking-[.18em] text-[var(--wb-green)]">
          W&apos;BAKENEL CONSULTING INSTITUTE
        </p>
        <h1 className="mt-6 text-5xl font-semibold md:text-7xl">W&apos;BAKENEL</h1>
        <p className="mt-6 text-xl text-[var(--wb-muted)]">{dictionary.descriptor}</p>
        <p className="mt-3 text-[var(--wb-muted)]">{dictionary.preparing}</p>
        <a
          href="https://wa.me/22651513197"
          className="mt-8 inline-flex bg-[var(--wb-green-deep)] px-5 py-3 text-white"
        >
          {dictionary.contact}
        </a>
      </div>
    </section>
  );
}
