import { requireAdmin } from "@/lib/auth/current-admin";
import { AdminSectionPlaceholder } from "../section-placeholder";
export default async function AdminFormationsPage() { await requireAdmin(); return <AdminSectionPlaceholder title="Formations" description="Gérez le catalogue de formations et ses publications." />; }
