"use client";

export default function AdminWorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="rounded-xl border border-red-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-semibold">Impossible de charger cet espace</h1><p className="mt-2 text-sm text-zinc-600">Une erreur temporaire est survenue. Réessayez dans un instant.</p><button type="button" onClick={reset} className="mt-5 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Réessayer</button></section>;
}
