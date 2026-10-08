import "server-only";

import { Locale, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const translationSelection = {
  select: { locale: true, title: true, description: true, isPublished: true },
} as const;

const engagementSelection = {
  id: true,
  type: true,
  status: true,
  visibility: true,
  startDate: true,
  endDate: true,
  translations: { where: { locale: Locale.FR }, select: { title: true }, take: 1 },
} as const;

const organizationSelection = {
  id: true,
  name: true,
  country: true,
  isActive: true,
  logoReference: true,
  _count: { select: { engagements: true } },
} as const;

export function createAdminClientsReader(client: PrismaClient) {
  return {
    directory: () =>
      client.clientOrganization.findMany({
        select: organizationSelection,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    organization: (organizationId: string) =>
      client.clientOrganization.findUnique({
        where: { id: organizationId },
        select: {
          ...organizationSelection,
          engagements: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 30,
            select: engagementSelection,
          },
        },
      }),
    engagement: (engagementId: string) =>
      client.clientEngagement.findUnique({
        where: { id: engagementId },
        select: {
          id: true,
          clientOrganizationId: true,
          type: true,
          status: true,
          visibility: true,
          startDate: true,
          endDate: true,
          clientOrganization: { select: { id: true, name: true } },
          translations: translationSelection,
        },
      }),
  };
}

export const adminClientsReader = createAdminClientsReader(prisma);
