import "server-only";

import { PricingMode, type PrismaClient, type SessionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { PublicSessionDto } from "./dto";
import { isRegistrationOpen, publicSessionWhere, publicTrainingWhere } from "./eligibility";
import type { PublicLocale } from "./locale";
import { toPrismaLocale } from "./locale";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

type SessionListOptions = {
  offset?: number;
  limit?: number;
};

type SelectedSession = {
  status: SessionStatus;
  startDate: Date;
  endDate: Date;
  registrationDeadline: Date | null;
  deliveryMode: PublicSessionDto["deliveryMode"];
  country: string | null;
  city: string | null;
  venue: string | null;
  pricingMode: PublicSessionDto["pricingMode"];
  price: { toString(): string } | null;
  currency: string | null;
  training: { translations: Array<{ slug: string; title: string }> };
};

function pageSize(requested?: number) {
  if (requested === undefined) {
    return DEFAULT_PAGE_SIZE;
  }

  if (!Number.isInteger(requested) || requested < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(requested, MAX_PAGE_SIZE);
}

function offset(requested?: number) {
  if (requested === undefined || !Number.isInteger(requested) || requested < 0) {
    return 0;
  }

  return requested;
}

function sessionSelect(locale: PublicLocale) {
  const prismaLocale = toPrismaLocale(locale);

  return {
    status: true,
    startDate: true,
    endDate: true,
    registrationDeadline: true,
    deliveryMode: true,
    country: true,
    city: true,
    venue: true,
    pricingMode: true,
    price: true,
    currency: true,
    training: {
      select: {
        translations: {
          where: { locale: prismaLocale, isPublished: true },
          select: { slug: true, title: true },
          take: 1,
        },
      },
    },
  };
}

function toPublicSessionDto(session: SelectedSession, today: Date): PublicSessionDto | null {
  const translation = session.training.translations[0];

  if (!translation) {
    return null;
  }

  return {
    trainingSlug: translation.slug,
    trainingTitle: translation.title,
    startDate: session.startDate,
    endDate: session.endDate,
    deliveryMode: session.deliveryMode,
    city: session.city,
    country: session.country,
    venue: session.venue,
    pricingMode: session.pricingMode,
    price: session.pricingMode === PricingMode.FIXED ? (session.price?.toString() ?? null) : null,
    currency: session.currency,
    registrationDeadline: session.registrationDeadline,
    registrationOpen: isRegistrationOpen(session, today),
  };
}

export function createPublicSessionReader(client: PrismaClient, clock = () => new Date()) {
  async function listSessions(
    locale: PublicLocale,
    options: SessionListOptions,
    trainingSlug?: string,
  ): Promise<PublicSessionDto[]> {
    const today = clock();
    const normalizedTrainingSlug = trainingSlug?.trim();

    if (trainingSlug !== undefined && !normalizedTrainingSlug) {
      return [];
    }

    const prismaLocale = toPrismaLocale(locale);
    const where = publicSessionWhere(locale, today);

    if (normalizedTrainingSlug) {
      where.training = {
        is: {
          ...publicTrainingWhere(locale),
          translations: {
            some: {
              locale: prismaLocale,
              slug: normalizedTrainingSlug,
              isPublished: true,
            },
          },
        },
      };
    }

    const sessions = await client.trainingSession.findMany({
      where,
      select: sessionSelect(locale),
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      skip: offset(options.offset),
      take: pageSize(options.limit),
    });

    return sessions.flatMap((session) => {
      const dto = toPublicSessionDto(session, today);
      return dto ? [dto] : [];
    });
  }

  return {
    listPublicUpcomingSessions(
      locale: PublicLocale,
      options: SessionListOptions = {},
    ): Promise<PublicSessionDto[]> {
      return listSessions(locale, options);
    },
    listPublicUpcomingSessionsForTraining(
      locale: PublicLocale,
      trainingSlug: string,
      options: SessionListOptions = {},
    ): Promise<PublicSessionDto[]> {
      return listSessions(locale, options, trainingSlug);
    },
  };
}

export const publicSessionReader = createPublicSessionReader(prisma);
