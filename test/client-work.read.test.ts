import { EngagementStatus, EngagementVisibility, Locale, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createPublicClientWorkReader } from "../lib/client-work.read";
describe("public engagements", () => { it("does not depend on organization activity", async () => { let args: unknown; const reader = createPublicClientWorkReader({ clientEngagement: { findMany: async (value: unknown) => { args = value; return []; } } } as unknown as PrismaClient); await reader.listPublicClientEngagements(Locale.FR); expect(args).toMatchObject({ where: { status: EngagementStatus.COMPLETED, visibility: EngagementVisibility.PUBLIC, translations: { some: { locale: Locale.FR, isPublished: true } } } }); expect(Object.keys((args as { where: object }).where)).not.toContain("clientOrganization"); }); });
