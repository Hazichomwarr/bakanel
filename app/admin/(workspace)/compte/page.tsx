import { requireAdmin } from "@/lib/auth/current-admin";
import { changePasswordAction } from "../../auth-actions";
import { AuthForm } from "../../auth-form";

export default async function AdminAccountPage() {
  await requireAdmin();
  return <section className="mx-auto max-w-xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-bold">Mon compte</h1><p className="mt-2 text-sm text-zinc-600">Choisissez un mot de passe d&apos;au moins 12 caractères. Cette action fermera toutes vos sessions actives.</p><div className="mt-6"><AuthForm action={changePasswordAction} submitLabel="Modifier le mot de passe" fields={[{ name: "currentPassword", label: "Mot de passe actuel", type: "password", autoComplete: "current-password" }, { name: "newPassword", label: "Nouveau mot de passe", type: "password", autoComplete: "new-password" }, { name: "confirmation", label: "Confirmer le nouveau mot de passe", type: "password", autoComplete: "new-password" }]} /></div></section>;
}
