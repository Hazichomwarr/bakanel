export function AdminSectionPlaceholder({ title, description }: { title: string; description: string }) {
  return <section className="max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"><p className="text-sm font-medium text-emerald-700">Administration</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1><p className="mt-3 text-zinc-600">{description}</p><p className="mt-6 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">La gestion détaillée sera disponible dans une prochaine étape.</p></section>;
}
