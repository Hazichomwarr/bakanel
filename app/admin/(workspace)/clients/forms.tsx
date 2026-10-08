"use client";

import { useActionState } from "react";

import type { ClientActionState } from "@/lib/admin/clients.actions";

type Action = (state: ClientActionState, formData: FormData) => Promise<ClientActionState>;

type ClientFormProps = {
  action: Action;
  children: React.ReactNode;
  label?: string;
};

export function ClientForm({ action, children, label = "Enregistrer" }: ClientFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-6">
      {children}
      {state.error ? <p role="alert" className="text-sm text-red-800">{state.error}</p> : null}
      <button disabled={isPending} className="min-h-11 bg-[#15382f] px-5 py-2 text-sm font-medium text-white">
        {isPending ? "Enregistrement…" : label}
      </button>
    </form>
  );
}
