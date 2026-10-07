import { describe, expect, it, vi } from "vitest";
import { ExpertStatus, Locale, SessionStatus, type PrismaClient } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createAdminSessionsReader, frenchTrainingTitle } from "../lib/admin/sessions.read";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function client() {
  const trainingSession = { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) };
  const training = { findMany: vi.fn().mockResolvedValue([]) };
  const expert = { findMany: vi.fn().mockResolvedValue([]) };
  return { client: { trainingSession, training, expert } as unknown as PrismaClient, trainingSession, training, expert };
}

describe("admin sessions reader", () => {
  it("separates future operational sessions, drafts, and a bounded history without parent-status filters", async () => {
    const captured = client();
    await createAdminSessionsReader(captured.client, () => day("2026-10-07")).workspace();
    expect(captured.trainingSession.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ take: 30, orderBy: { startDate: "asc" }, where: { startDate: { gte: day("2026-10-07") }, status: { in: [SessionStatus.OPEN, SessionStatus.CLOSED] } } }));
    expect(captured.trainingSession.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ take: 30, where: { status: SessionStatus.DRAFT } }));
    expect(captured.trainingSession.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({ take: 30, where: { OR: [{ status: { in: [SessionStatus.COMPLETED, SessionStatus.CANCELLED] } }, { startDate: { lt: day("2026-10-07") }, status: { in: [SessionStatus.OPEN, SessionStatus.CLOSED] } }] } }));
  });

  it("uses French-only presentation projections, retains assigned experts, and offers active experts for new assignment", async () => {
    const captured = client();
    await createAdminSessionsReader(captured.client).detail("session");
    expect(captured.trainingSession.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ training: expect.objectContaining({ select: expect.objectContaining({ translations: expect.objectContaining({ where: { locale: Locale.FR } }) }) }), expertAssignments: expect.anything() }) }));
    await createAdminSessionsReader(captured.client).creationSelectors();
    expect(captured.expert.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: ExpertStatus.ACTIVE } }));
    expect(frenchTrainingTitle({ translations: [{ title: "Titre FR" }] })).toBe("Titre FR");
    expect(frenchTrainingTitle({ translations: [] })).toBe("Formation sans titre français");
  });
});
