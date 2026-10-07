import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { logoutAction } from "./auth-actions";

export default async function AdminHomePage() {
  const admin = await requireAdmin();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">Administration W&apos;BAKENEL</h1>
      <p>Connecté en tant que {admin.email}</p>
      <div className="flex gap-4 text-sm">
        <Link href="/admin/password" className="underline">Changer le mot de passe</Link>
        <form action={logoutAction}>
          <button type="submit" className="underline">Se déconnecter</button>
        </form>
      </div>
    </main>
  );
}
