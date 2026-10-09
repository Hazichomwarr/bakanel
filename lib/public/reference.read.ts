import "server-only";

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { PublicReferenceDto } from "./dto";
import { publicReferenceWhere } from "./eligibility";
import type { PublicLocale } from "./locale";
import { toPrismaLocale } from "./locale";
import { publicOffset, publicPageSize, type PublicListOptions } from "./pagination";

type SelectedReference = {
  clientOrganization: {
    name: string;
    logoReference: string | null;
  };
  translations: Array<{
    title: string;
    description: string | null;
  }>;
};

function referenceSelect(locale: PublicLocale) {
  const prismaLocale = toPrismaLocale(locale);

  return {
    clientOrganization: {
      select: {
        name: true,
        logoReference: true,
      },
    },
    translations: {
      where: { locale: prismaLocale, isPublished: true, title: { not: "" } },
      select: {
        title: true,
        description: true,
      },
      take: 1,
    },
  };
}

function toPublicReferenceDto(reference: SelectedReference): PublicReferenceDto | null {
  const translation = reference.translations[0];

  if (!translation) {
    return null;
  }

  return {
    organizationName: reference.clientOrganization.name,
    organizationLogoReference: reference.clientOrganization.logoReference,
    title: translation.title,
    description: translation.description,
  };
}

export function createPublicReferenceReader(client: PrismaClient) {
  return {
    async listPublicReferences(
      locale: PublicLocale,
      options: PublicListOptions = {},
    ): Promise<PublicReferenceDto[]> {
      const references = await client.clientEngagement.findMany({
        where: publicReferenceWhere(locale),
        select: referenceSelect(locale),
        orderBy: [{ endDate: { sort: "desc", nulls: "last" } }, { id: "asc" }],
        skip: publicOffset(options.offset),
        take: publicPageSize(options.limit),
      });

      return references.flatMap((reference) => {
        const dto = toPublicReferenceDto(reference);
        return dto ? [dto] : [];
      });
    },
  };
}

export const publicReferenceReader = createPublicReferenceReader(prisma);
