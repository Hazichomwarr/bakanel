import Link from "next/link";
import { adminDashboardReader } from "@/lib/admin/dashboard.read";
import { requireAdmin } from "@/lib/auth/current-admin";
import { dashboardSessionStatusLabel, formatDashboardDate, formatDashboardPrice } from "@/lib/admin/dashboard.presentation";

const metricLabels = [
  ["publishedTrainings", "Formations publiées"],
  ["upcomingSessions", "Sessions à venir"],
  ["activeExperts", "Experts actifs"],
  ["publicEngagements", "Réalisations publiques"],
  ["publishedArticles", "Actualités publiées"],
] as const;

export default async function AdminDashboardPage() {
  // Authenticate before reading: the layout's check neither re-runs on client navigation nor gates this segment,
  // and requireAdmin's request-cookie read also makes the route dynamic before any query (no database work at build time).
  await requireAdmin();
  const dashboard = await adminDashboardReader.read();
  return <div className="space-y-8">
    <div><p className="text-sm font-medium text-emerald-700">Vue d&apos;ensemble</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Tableau de bord</h1><p className="mt-2 text-zinc-600">Suivez l&apos;activité éditoriale et opérationnelle de W&apos;BAKENEL.</p></div>
    <section aria-label="Indicateurs clés" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {metricLabels.map(([key, label]) => <article key={key} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"><p className="text-sm text-zinc-600">{label}</p><p className="mt-3 text-3xl font-bold tabular-nums">{dashboard.metrics[key]}</p></article>)}
    </section>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Prochaines sessions</h2><p className="mt-1 text-sm text-zinc-600">Sessions ouvertes ou closes à partir d&apos;aujourd&apos;hui.</p></div><Link href="/admin/sessions" className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded text-sm font-medium text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Voir les sessions</Link></div>
        {dashboard.upcomingSessions.length === 0 ? <p className="mt-6 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">Aucune session à venir pour le moment.</p> : <ul className="mt-5 divide-y divide-zinc-100">{dashboard.upcomingSessions.map((session) => <li key={session.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{session.title}</h3><p className="mt-1 text-sm text-zinc-600">{formatDashboardDate(session.startDate)} · {session.location}</p></div><div className="text-right"><p className="text-sm font-medium">{formatDashboardPrice(session)}</p><p className={`mt-1 text-xs font-medium ${session.status === "OPEN" ? "text-emerald-700" : "text-amber-700"}`}>{dashboardSessionStatusLabel(session.status)}</p></div></div></li>)}</ul>}
      </section>
      <aside className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">À traiter</h2><p className="mt-1 text-sm text-zinc-600">Contenus enregistrés comme brouillons.</p><dl className="mt-5 space-y-3">{[["Formations", dashboard.attention.draftTrainings], ["Sessions", dashboard.attention.draftSessions], ["Actualités", dashboard.attention.draftArticles]].map(([label, value]) => <div key={String(label)} className="flex justify-between border-b border-zinc-100 pb-3 text-sm"><dt>{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl></aside>
    </div>
  </div>;
}
