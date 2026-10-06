import "server-only";
import { EngagementStatus, EngagementVisibility, Locale, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertLocale } from "./client-work.validation";
export function createPublicClientWorkReader(client: PrismaClient) { return { listPublicClientEngagements(locale: Locale) { assertLocale(locale); return client.clientEngagement.findMany({ where: { status: EngagementStatus.COMPLETED, visibility: EngagementVisibility.PUBLIC, translations: { some: { locale, isPublished: true } } }, include: { clientOrganization: true, translations: { where: { locale, isPublished: true } } }, orderBy: [{ endDate: "desc" }, { id: "asc" }] }); } }; }
export const publicClientWorkReader = createPublicClientWorkReader(prisma);
