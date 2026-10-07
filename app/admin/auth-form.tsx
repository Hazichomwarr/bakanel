"use client";

import { useActionState } from "react";
import type { AuthFormState } from "./auth-actions";

type Field = { name: string; label: string; type: "email" | "password"; autoComplete: string };

export function AuthForm({ action, fields, submitLabel }: { action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>; fields: Field[]; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {fields.map(field => (
        <label key={field.name} className="flex flex-col gap-1 text-sm font-medium">
          {field.label}
          <input name={field.name} type={field.type} autoComplete={field.autoComplete} required className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-normal focus:border-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-700" />
        </label>
      ))}
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Veuillez patienter…" : submitLabel}
      </button>
    </form>
  );
}
