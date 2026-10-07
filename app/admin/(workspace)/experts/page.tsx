import { requireAdmin } from "@/lib/auth/current-admin";
import { AdminSectionPlaceholder } from "../section-placeholder";
export default async function AdminExpertsPage() { await requireAdmin(); return <AdminSectionPlaceholder title="Experts" description="Gérez les profils et la disponibilité des experts." />; }
