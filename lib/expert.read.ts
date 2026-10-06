import "server-only";
import { ExpertStatus, Locale, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertExpertLocale } from "./expert.validation";

export function createPublicExpertReader(client: PrismaClient) {
  return {
    listPublicExperts(locale: Locale) {
      assertExpertLocale(locale);
      return client.expert.findMany({ where: { status: ExpertStatus.ACTIVE, translations: { some: { locale, isPublished: true } } }, include: { translations: { where: { locale, isPublished: true } } }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }] });
    },
  };
}
export const publicExpertReader = createPublicExpertReader(prisma);
