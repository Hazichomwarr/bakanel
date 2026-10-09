import "server-only";

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { PublicExpertDto } from "./dto";
import { publicExpertWhere } from "./eligibility";
import type { PublicLocale } from "./locale";
import { toPrismaLocale } from "./locale";
import { publicOffset, publicPageSize, type PublicListOptions } from "./pagination";

type SelectedExpert = {
  name: string;
  portraitReference: string | null;
  translations: Array<{
    professionalTitle: string | null;
    specialization: string | null;
    biography: string | null;
  }>;
};

function expertSelect(locale: PublicLocale) {
  const prismaLocale = toPrismaLocale(locale);

  return {
    name: true,
    portraitReference: true,
    translations: {
      where: { locale: prismaLocale, isPublished: true },
      select: {
        professionalTitle: true,
        specialization: true,
        biography: true,
      },
      take: 1,
    },
  };
}

function toPublicExpertDto(expert: SelectedExpert): PublicExpertDto | null {
  const translation = expert.translations[0];

  if (!translation) {
    return null;
  }

  return {
    name: expert.name,
    professionalTitle: translation.professionalTitle,
    specialization: translation.specialization,
    biography: translation.biography,
    portraitReference: expert.portraitReference,
  };
}

export function createPublicExpertReader(client: PrismaClient) {
  return {
    async listPublicExperts(
      locale: PublicLocale,
      options: PublicListOptions = {},
    ): Promise<PublicExpertDto[]> {
      const experts = await client.expert.findMany({
        where: publicExpertWhere(locale),
        select: expertSelect(locale),
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        skip: publicOffset(options.offset),
        take: publicPageSize(options.limit),
      });

      return experts.flatMap((expert) => {
        const dto = toPublicExpertDto(expert);
        return dto ? [dto] : [];
      });
    },
  };
}

export const publicExpertReader = createPublicExpertReader(prisma);
