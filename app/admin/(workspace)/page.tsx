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
  return <div className="space-y-12 md:space-y-16">
    <header className="max-w-3xl border-b border-[#18211d] pb-8"><p className="wb-mono text-xs tracking-[0.16em] text-[#245b49]">TABLEAU DE BORD</p><h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] md:text-4xl">L&apos;activité de W&apos;BAKENEL, en un regard.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[#626862]">Une lecture opérationnelle du catalogue, des sessions et des contenus à suivre.</p></header>
    <section aria-label="Activité" className="border-y border-[#c8cac0] py-7 md:py-9">
      <p className="wb-mono mb-7 text-xs tracking-[0.16em] text-[#245b49]">ACTIVITÉ</p>
      <div className="grid grid-cols-2 gap-y-8 sm:grid-cols-3 xl:grid-cols-5 xl:gap-0">
      {metricLabels.map(([key, label], index) => <article key={key} className={`min-h-24 px-0 pr-5 sm:px-5 sm:first:pl-0 xl:border-l xl:border-[#c8cac0] xl:first:border-l-0 ${index === 0 ? "sm:pl-0" : ""}`}><p className="wb-mono text-4xl tracking-[-0.06em] tabular-nums md:text-5xl">{dashboard.metrics[key]}</p><p className="mt-3 max-w-28 text-sm leading-5 text-[#626862]">{label}</p></article>)}
      </div>
    </section>
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1.75fr)_minmax(17rem,0.75fr)] xl:gap-16">
      <section className="border-t border-[#18211d] pt-6"><div className="flex items-start justify-between gap-4"><div><p className="wb-mono text-xs tracking-[0.16em] text-[#245b49]">PROGRAMME</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">Prochaines sessions</h2></div><Link href="/admin/sessions" className="wb-action wb-focus inline-flex min-h-10 shrink-0 items-center border-b border-current text-sm font-medium">Voir les sessions</Link></div>
        {dashboard.upcomingSessions.length === 0 ? <p className="mt-12 text-lg leading-8 text-[#626862]">Aucune session à venir pour le moment.</p> : <ul className="mt-8 divide-y divide-[#c8cac0]">{dashboard.upcomingSessions.map((session) => <li key={session.id} className="py-5 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-5"><div><h3 className="text-lg font-semibold">{session.title}</h3><p className="mt-2 text-sm text-[#626862]">{formatDashboardDate(session.startDate)} <span aria-hidden="true">·</span> {session.location}</p></div><div className="min-w-36 text-left sm:text-right"><p className="text-sm font-medium">{formatDashboardPrice(session)}</p><p className={`mt-2 text-xs font-medium ${session.status === "OPEN" ? "text-[#245b49]" : "text-[#8a5b16]"}`}>{dashboardSessionStatusLabel(session.status)}</p></div></div></li>)}</ul>}
      </section>
      <aside className="border-t border-[#c8cac0] pt-6 xl:border-l xl:border-t-0 xl:pl-10"><p className="wb-mono text-xs tracking-[0.16em] text-[#245b49]">À SUIVRE</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">À traiter</h2><p className="mt-3 text-sm leading-6 text-[#626862]">Contenus enregistrés qui attendent une prochaine étape.</p><dl className="mt-8 divide-y divide-[#c8cac0]">{[["Formations", dashboard.attention.draftTrainings], ["Sessions", dashboard.attention.draftSessions], ["Actualités", dashboard.attention.draftArticles]].map(([label, value]) => <div key={String(label)} className="flex items-baseline justify-between py-4 text-sm"><dt>{label}</dt><dd className="wb-mono text-2xl tabular-nums">{value}</dd></div>)}</dl></aside>
    </div>
  </div>;
}
