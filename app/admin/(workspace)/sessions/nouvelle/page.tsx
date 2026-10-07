import { requireAdmin } from "@/lib/auth/current-admin";
import { adminSessionsReader } from "@/lib/admin/sessions.read";
import { createSessionAction } from "@/lib/admin/sessions.actions";
import { PrimaryLink, SessionHeader } from "../components";
import { SessionForm } from "../session-form";

export default async function NewSessionPage() { await requireAdmin(); const { trainings, experts } = await adminSessionsReader.creationSelectors(); return <div className="max-w-4xl"><SessionHeader title="Programmer une session" description="Une session est une occurrence datée d’une formation réutilisable du catalogue." actions={<PrimaryLink href="/admin/sessions">Retour aux sessions</PrimaryLink>} /><div className="mt-10">{trainings.length ? <SessionForm action={createSessionAction} trainings={trainings} experts={experts} initial={{ startDate: "", endDate: "", registrationDeadline: "", deliveryMode: "IN_PERSON", country: "", city: "", venue: "", pricingMode: "FIXED", price: "", currency: "XOF", capacity: "" }} /> : <p className="border-y border-[#c8cac0] py-7 text-[#626862]">Créez d’abord une formation avant de programmer une session.</p>}</div></div>; }
