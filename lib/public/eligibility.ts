import {
  ArticleStatus,
  CatalogueStatus,
  EngagementStatus,
  EngagementVisibility,
  ExpertStatus,
  Locale,
  SessionStatus,
  type Prisma,
} from "@prisma/client";

import type { PublicLocale } from "./locale";
import { toPrismaLocale } from "./locale";

const publishedTranslation = (locale: Locale) => ({ some: { locale, isPublished: true } });

export function publicDomainWhere(locale: PublicLocale): Prisma.TrainingDomainWhereInput {
  return {
    status: CatalogueStatus.PUBLISHED,
    translations: publishedTranslation(toPrismaLocale(locale)),
  };
}

export function publicTopicWhere(locale: PublicLocale): Prisma.TrainingTopicWhereInput {
  const prismaLocale = toPrismaLocale(locale);
  return {
    status: CatalogueStatus.PUBLISHED,
    translations: publishedTranslation(prismaLocale),
    trainingDomain: { is: publicDomainWhere(locale) },
  };
}

export function publicTrainingWhere(locale: PublicLocale): Prisma.TrainingWhereInput {
  const prismaLocale = toPrismaLocale(locale);
  return {
    status: CatalogueStatus.PUBLISHED,
    translations: publishedTranslation(prismaLocale),
    trainingTopic: { is: publicTopicWhere(locale) },
  };
}

export function publicExpertWhere(locale: PublicLocale): Prisma.ExpertWhereInput {
  return {
    status: ExpertStatus.ACTIVE,
    translations: publishedTranslation(toPrismaLocale(locale)),
  };
}

export function publicReferenceWhere(locale: PublicLocale): Prisma.ClientEngagementWhereInput {
  const prismaLocale = toPrismaLocale(locale);
  return {
    status: EngagementStatus.COMPLETED,
    visibility: EngagementVisibility.PUBLIC,
    translations: { some: { locale: prismaLocale, isPublished: true, title: { not: "" } } },
  };
}

export function publicArticleWhere(locale: PublicLocale): Prisma.ArticleWhereInput {
  return {
    status: ArticleStatus.PUBLISHED,
    publishedAt: { not: null },
    translations: publishedTranslation(toPrismaLocale(locale)),
  };
}

export function publicSessionWhere(
  locale: PublicLocale,
  today: Date,
): Prisma.TrainingSessionWhereInput {
  return {
    status: { in: [SessionStatus.OPEN, SessionStatus.CLOSED] },
    startDate: { gte: utcCalendarDate(today) },
    training: { is: publicTrainingWhere(locale) },
  };
}

export function utcCalendarDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isRegistrationOpen(
  session: { status: SessionStatus; startDate: Date; registrationDeadline: Date | null },
  today: Date,
) {
  const calendarToday = utcCalendarDate(today);
  return (
    session.status === SessionStatus.OPEN &&
    session.startDate >= calendarToday &&
    (!session.registrationDeadline || session.registrationDeadline >= calendarToday)
  );
}
