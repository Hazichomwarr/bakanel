import { requireAdmin } from "@/lib/auth/current-admin";
import { createExpertAction } from "@/lib/admin/experts.actions";
import { Header, PrimaryLink } from "../components";
import { ExpertForm } from "../expert-form";
export default async function NewExpertPage() { await requireAdmin(); return <div className="max-w-4xl"><Header title="Nouvel expert" description="Créez une identité professionnelle durable, puis complétez ses présentations par langue." action={<PrimaryLink href="/admin/experts">Retour aux experts</PrimaryLink>} /><div className="mt-10"><ExpertForm action={createExpertAction} locale="FR" /></div></div>; }
