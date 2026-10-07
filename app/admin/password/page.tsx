import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { changePasswordAction } from "../auth-actions";
import { AuthForm } from "../auth-form";

export default async function AdminPasswordPage() {
  await requireAdmin();
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Changer le mot de passe</h1>
      <p className="text-sm text-zinc-600">Au moins 12 caractères. Toutes vos sessions seront fermées et vous devrez vous reconnecter.</p>
      <AuthForm
        action={changePasswordAction}
        submitLabel="Modifier le mot de passe"
        fields={[
          { name: "currentPassword", label: "Mot de passe actuel", type: "password", autoComplete: "current-password" },
          { name: "newPassword", label: "Nouveau mot de passe", type: "password", autoComplete: "new-password" },
          { name: "confirmation", label: "Confirmer le nouveau mot de passe", type: "password", autoComplete: "new-password" },
        ]}
      />
      <Link href="/admin" className="text-sm underline">Retour</Link>
    </main>
  );
}
