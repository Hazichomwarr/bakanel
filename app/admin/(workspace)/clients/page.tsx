import { requireAdmin } from "@/lib/auth/current-admin";
import { AdminSectionPlaceholder } from "../section-placeholder";
export default async function AdminClientsPage() { await requireAdmin(); return <AdminSectionPlaceholder title="Clients" description="Consultez les organisations clientes et leurs réalisations." />; }
