import Link from "next/link";

export default function PublicNotFound() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <h1 className="text-4xl font-semibold">Page introuvable</h1>
      <Link className="mt-6 inline-flex border-b border-current" href="/fr">
        Retour à l’accueil
      </Link>
    </section>
  );
}
