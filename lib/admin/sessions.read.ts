import "server-only";

import { ExpertStatus, Locale, SessionStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCalendarDate } from "@/lib/training-session.validation";

const trainingSelect = {
  id: true,
  status: true,
  translations: { where: { locale: Locale.FR }, select: { title: true }, take: 1 },
  trainingTopic: { select: { translations: { where: { locale: Locale.FR }, select: { name: true }, take: 1 }, trainingDomain: { select: { translations: { where: { locale: Locale.FR }, select: { name: true }, take: 1 } } } } },
} as const;

const sessionSelect = {
  id: true, status: true, startDate: true, endDate: true, registrationDeadline: true,
  deliveryMode: true, country: true, city: true, venue: true, pricingMode: true,
  price: true, currency: true, capacity: true, training: { select: trainingSelect },
  expertAssignments: { select: { expert: { select: { id: true, name: true, status: true, translations: { where: { locale: Locale.FR }, select: { professionalTitle: true }, take: 1 } } } } },
} as const;

export const frenchTrainingTitle = (training: { translations: { title: string }[] }) => training.translations[0]?.title ?? "Formation sans titre français";
export const frenchName = (translations: { name: string }[]) => translations[0]?.name ?? "Sans traduction française";

export function createAdminSessionsReader(client: PrismaClient, now = () => new Date()) {
  return {
    async workspace() {
      const today = normalizeCalendarDate(now());
      const [upcoming, drafts, history] = await Promise.all([
        client.trainingSession.findMany({ where: { startDate: { gte: today }, status: { in: [SessionStatus.OPEN, SessionStatus.CLOSED] } }, orderBy: { startDate: "asc" }, take: 30, select: sessionSelect }),
        client.trainingSession.findMany({ where: { status: SessionStatus.DRAFT }, orderBy: [{ startDate: "asc" }, { id: "asc" }], take: 30, select: sessionSelect }),
        client.trainingSession.findMany({ where: { OR: [{ status: { in: [SessionStatus.COMPLETED, SessionStatus.CANCELLED] } }, { startDate: { lt: today }, status: { in: [SessionStatus.OPEN, SessionStatus.CLOSED] } }] }, orderBy: [{ startDate: "desc" }, { id: "desc" }], take: 30, select: sessionSelect }),
      ]);
      return { upcoming, drafts, history };
    },
    detail(id: string) { return client.trainingSession.findUnique({ where: { id }, select: sessionSelect }); },
    async creationSelectors() {
      const [trainings, experts] = await Promise.all([
        client.training.findMany({ select: trainingSelect, orderBy: { createdAt: "desc" }, take: 100 }),
        client.expert.findMany({ where: { status: ExpertStatus.ACTIVE }, select: { id: true, name: true, translations: { where: { locale: Locale.FR }, select: { professionalTitle: true }, take: 1 } }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take: 100 }),
      ]);
      return { trainings, experts };
    },
    activeExperts() { return client.expert.findMany({ where: { status: ExpertStatus.ACTIVE }, select: { id: true, name: true, translations: { where: { locale: Locale.FR }, select: { professionalTitle: true }, take: 1 } }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take: 100 }); },
  };
}

export const adminSessionsReader = createAdminSessionsReader(prisma);
