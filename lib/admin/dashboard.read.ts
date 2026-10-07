import "server-only";
import { ArticleStatus, CatalogueStatus, EngagementStatus, EngagementVisibility, ExpertStatus, Locale, SessionStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCalendarDate } from "@/lib/training-session.validation";

export function createAdminDashboardReader(client: PrismaClient, now = () => new Date()) {
  return {
    async read() {
      // Session dates are @db.Date calendar days held as UTC midnight (normalizeCalendarDate). Burkina Faso is
      // UTC+0 without DST, so the UTC calendar day is the local one, whatever the server's own timezone.
      const today = normalizeCalendarDate(now());
      const upcomingWhere = {
        startDate: { gte: today },
        status: { in: [SessionStatus.OPEN, SessionStatus.CLOSED] },
      };
      const [publishedTrainings, upcomingSessionsCount, activeExperts, publicEngagements, publishedArticles, draftTrainings, draftSessions, draftArticles, sessions] = await Promise.all([
        client.training.count({ where: { status: CatalogueStatus.PUBLISHED } }),
        client.trainingSession.count({ where: upcomingWhere }),
        client.expert.count({ where: { status: ExpertStatus.ACTIVE } }),
        client.clientEngagement.count({ where: { status: EngagementStatus.COMPLETED, visibility: EngagementVisibility.PUBLIC } }),
        client.article.count({ where: { status: ArticleStatus.PUBLISHED } }),
        client.training.count({ where: { status: CatalogueStatus.DRAFT } }),
        client.trainingSession.count({ where: { status: SessionStatus.DRAFT } }),
        client.article.count({ where: { status: ArticleStatus.DRAFT } }),
        client.trainingSession.findMany({
          where: upcomingWhere,
          orderBy: { startDate: "asc" },
          take: 5,
          select: {
            id: true,
            startDate: true,
            city: true,
            deliveryMode: true,
            status: true,
            pricingMode: true,
            price: true,
            currency: true,
            training: {
              select: {
                translations: { where: { locale: Locale.FR }, select: { title: true }, take: 1 },
              },
            },
          },
        }),
      ]);

      return {
        metrics: { publishedTrainings, upcomingSessions: upcomingSessionsCount, activeExperts, publicEngagements, publishedArticles },
        attention: { draftTrainings, draftSessions, draftArticles },
        upcomingSessions: sessions.map((session) => ({
          id: session.id,
          title: session.training.translations[0]?.title ?? "Formation sans titre français",
          startDate: session.startDate,
          location: session.deliveryMode === "ONLINE" ? "En ligne" : session.city ?? "Lieu à confirmer",
          status: session.status,
          pricingMode: session.pricingMode,
          price: session.price?.toString() ?? null,
          currency: session.currency,
        })),
      };
    },
  };
}

export const adminDashboardReader = createAdminDashboardReader(prisma);
