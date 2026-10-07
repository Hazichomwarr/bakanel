import { requireAdmin } from "@/lib/auth/current-admin";
import { changePasswordAction } from "../../auth-actions";
import { AuthForm } from "../../auth-form";

export default async function AdminAccountPage() {
  await requireAdmin();
  return <section className="max-w-2xl border-t border-[#18211d] pt-7"><p className="wb-mono text-xs tracking-[0.16em] text-[#245b49]">PARAMÈTRES</p><h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">Mon compte</h1><div className="mt-10 border-y border-[#c8cac0] py-8"><h2 className="text-xl font-semibold">Mot de passe</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[#626862]">Choisissez un mot de passe d&apos;au moins 12 caractères. Cette action fermera toutes vos sessions actives.</p><div className="mt-7 max-w-lg"><AuthForm action={changePasswordAction} submitLabel="Modifier le mot de passe" fields={[{ name: "currentPassword", label: "Mot de passe actuel", type: "password", autoComplete: "current-password" }, { name: "newPassword", label: "Nouveau mot de passe", type: "password", autoComplete: "new-password" }, { name: "confirmation", label: "Confirmer le nouveau mot de passe", type: "password", autoComplete: "new-password" }]} /></div></div></section>;
}
