import { requireAdmin } from "@/lib/auth/current-admin";
import { AdminNavigation } from "./navigation";

export default async function AdminWorkspaceLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return <AdminNavigation adminEmail={admin.email}>{children}</AdminNavigation>;
}
