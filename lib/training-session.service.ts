import "server-only";

import { DeliveryMode, ExpertStatus, Prisma, PrismaClient, PricingMode, SessionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { TrainingSessionDomainError } from "./training-session.errors";
import { normalizeSessionFacts, type SessionFacts } from "./training-session.validation";

const mutableStatuses: SessionStatus[] = [SessionStatus.DRAFT, SessionStatus.OPEN, SessionStatus.CLOSED];

const transitions: Record<SessionStatus, readonly SessionStatus[]> = {
  DRAFT: [SessionStatus.OPEN, SessionStatus.CANCELLED],
  OPEN: [SessionStatus.CLOSED, SessionStatus.CANCELLED],
  CLOSED: [SessionStatus.OPEN, SessionStatus.COMPLETED, SessionStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

type DecimalInput = Prisma.Decimal | string | number | null;

export type CreateTrainingSessionInput = Omit<SessionFacts, "price"> & {
  trainingId: string;
  price: DecimalInput;
};

export type UpdateTrainingSessionInput = Partial<Omit<SessionFacts, "price">> & {
  price?: DecimalInput;
};

type Session = Awaited<ReturnType<PrismaClient["trainingSession"]["findUnique"]>>;

function domainError(code: ConstructorParameters<typeof TrainingSessionDomainError>[0], message: string): never {
  throw new TrainingSessionDomainError(code, message);
}

function decimal(value: DecimalInput): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

function asFacts(session: NonNullable<Session>): SessionFacts {
  return {
    startDate: session.startDate,
    endDate: session.endDate,
    registrationDeadline: session.registrationDeadline,
    deliveryMode: session.deliveryMode,
    country: session.country,
    city: session.city,
    venue: session.venue,
    pricingMode: session.pricingMode,
    price: session.price,
    currency: session.currency,
    capacity: session.capacity,
  };
}

function assertMutable(session: NonNullable<Session>) {
  if (!mutableStatuses.includes(session.status)) {
    domainError("SESSION_IMMUTABLE", "Completed and cancelled sessions are historical records.");
  }
}

function isPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function createTrainingSessionService(client: PrismaClient, today = () => new Date()) {
  async function loadSession(tx: Prisma.TransactionClient, sessionId: string) {
    const session = await tx.trainingSession.findUnique({ where: { id: sessionId } });
    if (!session) domainError("SESSION_NOT_FOUND", "Training session was not found.");
    return session;
  }

  async function lockMutableSession(tx: Prisma.TransactionClient, sessionId: string) {
    const result = await tx.trainingSession.updateMany({
      where: { id: sessionId, status: { in: mutableStatuses } },
      data: { updatedAt: new Date() },
    });
    if (result.count !== 1) domainError("STALE_SESSION_STATE", "The session lifecycle state changed before this mutation completed.");
  }

  async function transition(sessionId: string, target: SessionStatus) {
    return client.$transaction(async (tx) => {
      const session = await loadSession(tx, sessionId);
      if (!transitions[session.status].includes(target)) {
        domainError("INVALID_TRANSITION", `Cannot transition ${session.status} to ${target}.`);
      }

      if (target === SessionStatus.OPEN) normalizeSessionFacts(asFacts(session));
      if (target === SessionStatus.COMPLETED) {
        const normalizedToday = new Date(Date.UTC(today().getUTCFullYear(), today().getUTCMonth(), today().getUTCDate()));
        if (session.endDate > normalizedToday) {
          domainError("INVALID_TRANSITION", "A future session cannot be completed.");
        }
      }

      const result = await tx.trainingSession.updateMany({
        where: { id: sessionId, status: session.status },
        data: { status: target },
      });
      if (result.count !== 1) domainError("STALE_SESSION_STATE", "The session lifecycle state changed before transition.");

      return loadSession(tx, sessionId);
    });
  }

  return {
    async createTrainingSession(input: CreateTrainingSessionInput) {
      const facts = normalizeSessionFacts({ ...input, price: decimal(input.price) });
      return client.$transaction(async (tx) => {
        const training = await tx.training.findUnique({ where: { id: input.trainingId }, select: { id: true } });
        if (!training) domainError("TRAINING_NOT_FOUND", "Training was not found.");
        try {
          return await tx.trainingSession.create({ data: { trainingId: input.trainingId, status: SessionStatus.DRAFT, ...facts } });
        } catch (error) {
          if (isPrismaCode(error, "P2003")) domainError("TRAINING_NOT_FOUND", "Training was not found.");
          throw error;
        }
      });
    },

    async updateTrainingSession(sessionId: string, input: UpdateTrainingSessionInput) {
      return client.$transaction(async (tx) => {
        const session = await loadSession(tx, sessionId);
        assertMutable(session);
        const current = asFacts(session);
        const switchingToOnRequest = input.pricingMode === PricingMode.ON_REQUEST;
        const switchingToOnline = input.deliveryMode === DeliveryMode.ONLINE;
        const facts = normalizeSessionFacts({
          startDate: input.startDate ?? current.startDate,
          endDate: input.endDate ?? current.endDate,
          price: switchingToOnRequest ? null : input.price === undefined ? current.price : decimal(input.price),
          currency: switchingToOnRequest ? null : input.currency === undefined ? current.currency : input.currency,
          pricingMode: input.pricingMode ?? current.pricingMode,
          deliveryMode: input.deliveryMode ?? current.deliveryMode,
          country: switchingToOnline ? null : input.country === undefined ? current.country : input.country,
          city: switchingToOnline ? null : input.city === undefined ? current.city : input.city,
          venue: switchingToOnline ? null : input.venue === undefined ? current.venue : input.venue,
          registrationDeadline:
            input.registrationDeadline === undefined ? current.registrationDeadline : input.registrationDeadline,
          capacity: input.capacity === undefined ? current.capacity : input.capacity,
        });
        await lockMutableSession(tx, sessionId);
        return tx.trainingSession.update({ where: { id: sessionId }, data: facts });
      });
    },

    openTrainingSession: (sessionId: string) => transition(sessionId, SessionStatus.OPEN),
    closeTrainingSession: (sessionId: string) => transition(sessionId, SessionStatus.CLOSED),
    completeTrainingSession: (sessionId: string) => transition(sessionId, SessionStatus.COMPLETED),
    cancelTrainingSession: (sessionId: string) => transition(sessionId, SessionStatus.CANCELLED),

    async assignExpertToTrainingSession(sessionId: string, expertId: string) {
      return client.$transaction(async (tx) => {
        const session = await loadSession(tx, sessionId);
        assertMutable(session);
        await lockMutableSession(tx, sessionId);
        const expert = await tx.expert.findUnique({ where: { id: expertId }, select: { status: true } });
        if (!expert) domainError("EXPERT_NOT_FOUND", "Expert was not found.");
        if (expert.status !== ExpertStatus.ACTIVE) domainError("EXPERT_INACTIVE", "Inactive experts cannot receive new assignments.");
        try {
          return await tx.trainingSessionExpert.create({ data: { trainingSessionId: sessionId, expertId } });
        } catch (error) {
          if (isPrismaCode(error, "P2002")) domainError("EXPERT_ALREADY_ASSIGNED", "Expert is already assigned to this session.");
          throw error;
        }
      });
    },

    async removeExpertFromTrainingSession(sessionId: string, expertId: string) {
      return client.$transaction(async (tx) => {
        const session = await loadSession(tx, sessionId);
        assertMutable(session);
        await lockMutableSession(tx, sessionId);
        const result = await tx.trainingSessionExpert.deleteMany({ where: { trainingSessionId: sessionId, expertId } });
        if (result.count !== 1) domainError("EXPERT_NOT_ASSIGNED", "Expert is not assigned to this session.");
      });
    },
  };
}

export const trainingSessionService = createTrainingSessionService(prisma);
