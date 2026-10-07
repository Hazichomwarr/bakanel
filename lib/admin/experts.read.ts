import "server-only";

import { ExpertStatus, Locale, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const translations = { select: { locale: true, professionalTitle: true, specialization: true, biography: true, isPublished: true } } as const;
const sessionSelect = { id: true, status: true, startDate: true, endDate: true, training: { select: { translations: { where: { locale: Locale.FR }, select: { title: true }, take: 1 } } } } as const;
const expertSelect = { id: true, name: true, status: true, portraitReference: true, displayOrder: true, translations, _count: { select: { sessionAssignments: true } } } as const;

export const frenchProfile = (items: { locale: Locale; professionalTitle: string | null; specialization: string | null }[]) => items.find((item) => item.locale === Locale.FR);
export const expertLabel = (expert: { name: string; translations: { locale: Locale; professionalTitle: string | null }[] }) => expert.translations.find((item) => item.locale === Locale.FR)?.professionalTitle ?? "Présentation française à renseigner";

export function createAdminExpertsReader(client: PrismaClient) {
  return {
    async workspace() {
      const [active, inactive] = await Promise.all([
        client.expert.findMany({ where: { status: ExpertStatus.ACTIVE }, select: expertSelect, orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }] }),
        client.expert.findMany({ where: { status: ExpertStatus.INACTIVE }, select: expertSelect, orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }] }),
      ]);
      return { active, inactive };
    },
    detail(id: string) {
      return client.expert.findUnique({ where: { id }, select: { ...expertSelect, sessionAssignments: { orderBy: { trainingSession: { startDate: "desc" } }, take: 20, select: { trainingSession: { select: sessionSelect } } } } });
    },
  };
}
export const adminExpertsReader = createAdminExpertsReader(prisma);
