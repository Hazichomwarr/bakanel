import { DeliveryMode, PricingMode, SessionStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createPublicSessionReader } from "../lib/public/session.read";

const today = new Date("2026-10-08T23:30:00.000Z");

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "internal-session-id",
    status: SessionStatus.OPEN,
    startDate: new Date("2026-10-09T00:00:00.000Z"),
    endDate: new Date("2026-10-10T00:00:00.000Z"),
    registrationDeadline: new Date("2026-10-08T00:00:00.000Z"),
    deliveryMode: DeliveryMode.IN_PERSON,
    country: "BF",
    city: "Ouagadougou",
    venue: "Centre de formation",
    pricingMode: PricingMode.FIXED,
    price: { toString: () => "150000.00" },
    currency: "XOF",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    training: {
      id: "internal-training-id",
      translations: [{ slug: "gestion-risques", title: "Gestion des risques" }],
    },
    ...overrides,
  };
}

function readerWithSessions(sessions: unknown[] = []) {
  const trainingSession = {
    findMany: vi.fn().mockResolvedValue(sessions),
  };
  const reader = createPublicSessionReader(
    { trainingSession } as unknown as PrismaClient,
    () => today,
  );

  return { reader, trainingSession };
}

describe("public session reader", () => {
  it("queries OPEN and CLOSED future sessions through the full published training ancestry", async () => {
    const { reader, trainingSession } = readerWithSessions();

    await reader.listPublicUpcomingSessions("en", { offset: 3, limit: 999 });

    expect(trainingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: [SessionStatus.OPEN, SessionStatus.CLOSED] },
          startDate: { gte: new Date("2026-10-08T00:00:00.000Z") },
          training: {
            is: {
              status: "PUBLISHED",
              translations: { some: { locale: "EN", isPublished: true } },
              trainingTopic: {
                is: {
                  status: "PUBLISHED",
                  translations: { some: { locale: "EN", isPublished: true } },
                  trainingDomain: {
                    is: {
                      status: "PUBLISHED",
                      translations: { some: { locale: "EN", isPublished: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
        skip: 3,
        take: 48,
      }),
    );
  });

  it("maps an OPEN session with a deadline today into a safe, registration-open DTO", async () => {
    const { reader } = readerWithSessions([session()]);

    await expect(reader.listPublicUpcomingSessions("fr")).resolves.toEqual([
      {
        trainingSlug: "gestion-risques",
        trainingTitle: "Gestion des risques",
        startDate: new Date("2026-10-09T00:00:00.000Z"),
        endDate: new Date("2026-10-10T00:00:00.000Z"),
        deliveryMode: DeliveryMode.IN_PERSON,
        city: "Ouagadougou",
        country: "BF",
        venue: "Centre de formation",
        pricingMode: PricingMode.FIXED,
        price: "150000.00",
        currency: "XOF",
        registrationDeadline: new Date("2026-10-08T00:00:00.000Z"),
        registrationOpen: true,
      },
    ]);
  });

  it("keeps eligible CLOSED and deadline-expired sessions discoverable but registration-closed", async () => {
    const { reader } = readerWithSessions([
      session({ status: SessionStatus.CLOSED }),
      session({ registrationDeadline: new Date("2026-10-07T00:00:00.000Z") }),
    ]);

    const sessions = await reader.listPublicUpcomingSessions("fr");

    expect(sessions).toHaveLength(2);
    expect(sessions.every((publicSession) => !publicSession.registrationOpen)).toBe(true);
  });

  it("does not expose a stray price for an on-request session", async () => {
    const { reader } = readerWithSessions([
      session({ pricingMode: PricingMode.ON_REQUEST, price: { toString: () => "150000.00" } }),
    ]);

    await expect(reader.listPublicUpcomingSessions("fr")).resolves.toEqual([
      expect.objectContaining({ pricingMode: PricingMode.ON_REQUEST, price: null }),
    ]);
  });

  it("uses the requested published localized training slug inside the database predicate", async () => {
    const { reader, trainingSession } = readerWithSessions();

    await reader.listPublicUpcomingSessionsForTraining("pt", "gestao-riscos");

    expect(trainingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          training: {
            is: expect.objectContaining({
              translations: {
                some: {
                  locale: "PT",
                  slug: "gestao-riscos",
                  isPublished: true,
                },
              },
            }),
          },
        }),
      }),
    );
  });

  it("does not query for an empty training slug", async () => {
    const { reader, trainingSession } = readerWithSessions();

    await expect(reader.listPublicUpcomingSessionsForTraining("fr", "   ")).resolves.toEqual([]);

    expect(trainingSession.findMany).not.toHaveBeenCalled();
  });

  it("normalizes invalid pagination to the bounded default", async () => {
    const { reader, trainingSession } = readerWithSessions();

    await reader.listPublicUpcomingSessions("fr", { offset: -4, limit: 0 });

    expect(trainingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 12 }),
    );
  });
});
