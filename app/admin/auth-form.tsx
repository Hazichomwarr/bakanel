"use client";

import { useActionState } from "react";
import type { AuthFormState } from "./auth-actions";

type Field = { name: string; label: string; type: "email" | "password"; autoComplete: string };

export function AuthForm({ action, fields, submitLabel }: { action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>; fields: Field[]; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {fields.map(field => (
        <label key={field.name} className="flex flex-col gap-2 text-sm font-medium">
          {field.label}
          <input name={field.name} type={field.type} autoComplete={field.autoComplete} required className="min-h-11 border border-[#a8aaa1] bg-[#fbfaf7] px-3 py-2 text-base font-normal focus:border-[#245b49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245b49]" />
        </label>
      ))}
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="min-h-11 self-start bg-[#15382f] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#245b49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245b49] disabled:opacity-60">
        {pending ? "Veuillez patienter…" : submitLabel}
      </button>
    </form>
  );
}
