"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

const copy = {
  fr: { title: "Une erreur est survenue", action: "Retour à l’accueil" },
  en: { title: "Something went wrong", action: "Back to home" },
  pt: { title: "Ocorreu um erro", action: "Voltar ao início" },
} as const;

export default function PublicError() {
  const { locale } = useParams<{ locale?: string }>();
  const selectedLocale = locale === "en" || locale === "pt" ? locale : "fr";
  const dictionary = copy[selectedLocale];

  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <h1 className="text-4xl font-semibold">{dictionary.title}</h1>
      <Link className="mt-6 inline-flex border-b border-current" href={`/${selectedLocale}`}>
        {dictionary.action}
      </Link>
    </section>
  );
}
