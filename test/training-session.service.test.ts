/* eslint-disable @typescript-eslint/no-explicit-any */
import { DeliveryMode, ExpertStatus, PricingMode, SessionStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { TrainingSessionDomainError } from "../lib/training-session.errors";
import { createTrainingSessionService } from "../lib/training-session.service";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

function createStore() {
  const sessions = new Map<string, any>();
  const experts = new Map<string, any>([["active", { status: ExpertStatus.ACTIVE }], ["inactive", { status: ExpertStatus.INACTIVE }]]);
  const assignments = new Set<string>();
  let staleNextMutation = false;
  const key = (sessionId: string, expertId: string) => `${sessionId}:${expertId}`;
  const store: any = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(store),
    training: { findUnique: async ({ where }: any) => (where.id === "training" ? { id: "training" } : null) },
    trainingSession: {
      findUnique: async ({ where }: any) => sessions.get(where.id) ?? null,
      create: async ({ data }: any) => {
        const session = { id: `session-${sessions.size + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        sessions.set(session.id, session);
        return session;
      },
      update: async ({ where, data }: any) => {
        const session = sessions.get(where.id);
        Object.assign(session, data, { updatedAt: new Date() });
        return session;
      },
      updateMany: async ({ where, data }: any) => {
        const session = sessions.get(where.id);
        if (staleNextMutation) {
          staleNextMutation = false;
          return { count: 0 };
        }
        const statuses = where.status?.in ?? [where.status];
        if (!session || !statuses.includes(session.status)) return { count: 0 };
        Object.assign(session, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    expert: { findUnique: async ({ where }: any) => experts.get(where.id) ?? null },
    trainingSessionExpert: {
      create: async ({ data }: any) => {
        const assignmentKey = key(data.trainingSessionId, data.expertId);
        if (assignments.has(assignmentKey)) throw { code: "P2002" };
        assignments.add(assignmentKey);
        return { id: assignmentKey, ...data, createdAt: new Date() };
      },
      deleteMany: async ({ where }: any) => ({ count: assignments.delete(key(where.trainingSessionId, where.expertId)) ? 1 : 0 }),
    },
  };
  return { store, sessions, assignments, makeNextMutationStale: () => (staleNextMutation = true) };
}

const input = () => ({
  trainingId: "training",
  startDate: date("2026-01-10"),
  endDate: date("2026-01-11"),
  registrationDeadline: date("2026-01-10"),
  deliveryMode: DeliveryMode.IN_PERSON,
  country: "BF",
  city: "Ouagadougou",
  venue: "Hotel",
  pricingMode: PricingMode.FIXED,
  price: "150000",
  currency: "XOF",
  capacity: 25,
});

function expectCode(promise: Promise<unknown>, code: TrainingSessionDomainError["code"]) {
  return expect(promise).rejects.toEqual(expect.objectContaining({ code }));
}

describe("TrainingSession service", () => {
  it("creates sessions only for existing training, then performs approved transitions", async () => {
    const fake = createStore();
    const service = createTrainingSessionService(fake.store as PrismaClient, () => date("2026-02-01"));
    const session = await service.createTrainingSession(input());
    expect(session.status).toBe(SessionStatus.DRAFT);
    await service.openTrainingSession(session.id);
    await service.closeTrainingSession(session.id);
    await service.completeTrainingSession(session.id);
    expect(fake.sessions.get(session.id).status).toBe(SessionStatus.COMPLETED);
  });

  it("rejects creation for a missing training", async () => {
    const fake = createStore();
    const service = createTrainingSessionService(fake.store as PrismaClient);
    await expectCode(service.createTrainingSession({ ...input(), trainingId: "missing" }), "TRAINING_NOT_FOUND");
  });

  it("permits cancellation from all mutable states and preserves the row", async () => {
    for (const status of [SessionStatus.DRAFT, SessionStatus.OPEN, SessionStatus.CLOSED]) {
      const fake = createStore();
      const service = createTrainingSessionService(fake.store as PrismaClient);
      const session = await service.createTrainingSession(input());
      fake.sessions.get(session.id).status = status;
      await service.cancelTrainingSession(session.id);
      expect(fake.sessions.get(session.id).status).toBe(SessionStatus.CANCELLED);
    }
  });

  it("rejects invalid lifecycle transitions and future completion", async () => {
    const fake = createStore();
    const service = createTrainingSessionService(fake.store as PrismaClient, () => date("2026-01-01"));
    const session = await service.createTrainingSession(input());
    await expectCode(service.completeTrainingSession(session.id), "INVALID_TRANSITION");
    await service.openTrainingSession(session.id);
    await expectCode(service.completeTrainingSession(session.id), "INVALID_TRANSITION");
    await service.closeTrainingSession(session.id);
    await expectCode(service.completeTrainingSession(session.id), "INVALID_TRANSITION");
  });

  it("allows CLOSED to reopen and rejects every terminal transition", async () => {
    const fake = createStore();
    const service = createTrainingSessionService(fake.store as PrismaClient, () => date("2026-02-01"));
    const session = await service.createTrainingSession(input());
    await service.openTrainingSession(session.id);
    await service.closeTrainingSession(session.id);
    await service.openTrainingSession(session.id);
    expect(fake.sessions.get(session.id).status).toBe(SessionStatus.OPEN);
    fake.sessions.get(session.id).status = SessionStatus.COMPLETED;
    await expectCode(service.openTrainingSession(session.id), "INVALID_TRANSITION");
    await expectCode(service.cancelTrainingSession(session.id), "INVALID_TRANSITION");
    fake.sessions.get(session.id).status = SessionStatus.CANCELLED;
    await expectCode(service.openTrainingSession(session.id), "INVALID_TRANSITION");
  });

  it("keeps completed and cancelled sessions immutable, including trainer changes", async () => {
    const fake = createStore();
    const service = createTrainingSessionService(fake.store as PrismaClient, () => date("2026-02-01"));
    const session = await service.createTrainingSession(input());
    fake.sessions.get(session.id).status = SessionStatus.COMPLETED;
    await expectCode(service.updateTrainingSession(session.id, { city: "Bobo" }), "SESSION_IMMUTABLE");
    await expectCode(service.assignExpertToTrainingSession(session.id, "active"), "SESSION_IMMUTABLE");
    await expectCode(service.removeExpertFromTrainingSession(session.id, "active"), "SESSION_IMMUTABLE");
    fake.sessions.get(session.id).status = SessionStatus.CANCELLED;
    await expectCode(service.updateTrainingSession(session.id, { city: "Bobo" }), "SESSION_IMMUTABLE");
    await expectCode(service.assignExpertToTrainingSession(session.id, "active"), "SESSION_IMMUTABLE");
    await expectCode(service.removeExpertFromTrainingSession(session.id, "active"), "SESSION_IMMUTABLE");
  });

  it("normalizes updates that switch to on-request and online", async () => {
    const fake = createStore();
    const service = createTrainingSessionService(fake.store as PrismaClient);
    const session = await service.createTrainingSession(input());
    const onRequest = await service.updateTrainingSession(session.id, { pricingMode: PricingMode.ON_REQUEST });
    expect(onRequest.price).toBeNull();
    expect(onRequest.currency).toBeNull();
    const online = await service.updateTrainingSession(session.id, { deliveryMode: DeliveryMode.ONLINE });
    expect(online).toMatchObject({ country: null, city: null, venue: null });
  });

  it("enforces active, unique, mutable expert assignments while retaining completed history", async () => {
    const fake = createStore();
    const service = createTrainingSessionService(fake.store as PrismaClient);
    const session = await service.createTrainingSession(input());
    await service.assignExpertToTrainingSession(session.id, "active");
    await expectCode(service.assignExpertToTrainingSession(session.id, "active"), "EXPERT_ALREADY_ASSIGNED");
    await expectCode(service.assignExpertToTrainingSession(session.id, "inactive"), "EXPERT_INACTIVE");
    await expectCode(service.assignExpertToTrainingSession(session.id, "missing"), "EXPERT_NOT_FOUND");
    fake.sessions.get(session.id).status = SessionStatus.COMPLETED;
    expect(fake.assignments.has(`${session.id}:active`)).toBe(true);
    await expectCode(service.removeExpertFromTrainingSession(session.id, "active"), "SESSION_IMMUTABLE");
  });

  it("removes assignments only from the requested mutable session", async () => {
    const fake = createStore();
    const service = createTrainingSessionService(fake.store as PrismaClient);
    const first = await service.createTrainingSession(input());
    const second = await service.createTrainingSession(input());
    await service.assignExpertToTrainingSession(first.id, "active");
    await service.assignExpertToTrainingSession(second.id, "active");
    await service.removeExpertFromTrainingSession(first.id, "active");
    expect(fake.assignments.has(`${first.id}:active`)).toBe(false);
    expect(fake.assignments.has(`${second.id}:active`)).toBe(true);
    await expectCode(service.removeExpertFromTrainingSession(first.id, "active"), "EXPERT_NOT_ASSIGNED");
  });

  it("fails a stale mutation rather than overwriting a terminal lifecycle change", async () => {
    const fake = createStore();
    const service = createTrainingSessionService(fake.store as PrismaClient);
    const session = await service.createTrainingSession(input());
    fake.makeNextMutationStale();
    await expectCode(service.updateTrainingSession(session.id, { city: "Bobo-Dioulasso" }), "STALE_SESSION_STATE");
  });
});
