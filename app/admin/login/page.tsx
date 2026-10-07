import { redirect } from "next/navigation";
import { ADMIN_HOME_PATH, getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginAction } from "../auth-actions";
import { AuthForm } from "../auth-form";

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await getCurrentAdmin()) redirect(ADMIN_HOME_PATH);
  const passwordChanged = (await searchParams).motDePasse === "modifie";
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Administration W&apos;BAKENEL</h1>
      {passwordChanged && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">Mot de passe modifié. Veuillez vous reconnecter.</p>}
      <AuthForm
        action={loginAction}
        submitLabel="Se connecter"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "username" },
          { name: "password", label: "Mot de passe", type: "password", autoComplete: "current-password" },
        ]}
      />
    </main>
  );
}
