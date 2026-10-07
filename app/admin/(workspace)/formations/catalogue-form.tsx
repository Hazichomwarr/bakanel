"use client";

import { useActionState } from "react";
import type { CatalogueActionState } from "@/lib/admin/catalogue.actions";

type Action = (state: CatalogueActionState, formData: FormData) => Promise<CatalogueActionState>;

export function CatalogueForm({ action, children }: { action: Action; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="space-y-7">
    {children}
    {state.error && <p role="alert" className="border-l-2 border-red-700 py-2 pl-3 text-sm leading-6 text-red-800">{state.error}</p>}
    <button type="submit" disabled={pending} className="min-h-11 bg-[#15382f] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#245b49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245b49] disabled:opacity-60">{pending ? "Enregistrement…" : "Enregistrer"}</button>
  </form>;
}

export function CatalogueActionForm({ action, children }: { action: Action; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="contents">
    {children}
    {state.error && <p role="alert" className="mt-3 text-sm text-red-800">{state.error}</p>}
    {pending && <p className="mt-3 text-sm text-[#626862]">Mise à jour…</p>}
  </form>;
}
