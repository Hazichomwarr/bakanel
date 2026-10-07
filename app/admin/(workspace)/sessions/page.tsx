import { requireAdmin } from "@/lib/auth/current-admin";
import { AdminSectionPlaceholder } from "../section-placeholder";
export default async function AdminSessionsPage() { await requireAdmin(); return <AdminSectionPlaceholder title="Sessions" description="Suivez les sessions de formation planifiées." />; }
