import { requireAdmin } from "@/lib/auth/current-admin";
import { AdminSectionPlaceholder } from "../section-placeholder";
export default async function AdminActualitesPage() { await requireAdmin(); return <AdminSectionPlaceholder title="Actualités" description="Préparez et publiez les contenus éditoriaux." />; }
