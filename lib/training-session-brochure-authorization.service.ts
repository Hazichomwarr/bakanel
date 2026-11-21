import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  BrochureUploadAttemptKind,
  Prisma,
  PrismaClient,
  SessionStatus,
  TrainingSessionBrochureState,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { createTrainingSessionBrochureService } from "./training-session-brochure.service";
import type { VerifiedPrivateBrochureObject } from "./session-brochure-storage";

const WINDOW_MS = 60 * 60 * 1000;
const AUTHORIZATION_MS = 5 * 60 * 1000;
const RETENTION_MS = 30 * 24 * WINDOW_MS;
const LIMITS = { ISSUE: 10, FINALIZE: 20 } as const;
const MUTABLE = [SessionStatus.DRAFT, SessionStatus.OPEN, SessionStatus.CLOSED];

export class BrochureUploadAuthorizationError extends Error {
  constructor(readonly code: "INVALID_AUTHORIZATION" | "THROTTLED" | "IMMUTABLE_SESSION") {
    super(code);
    this.name = "BrochureUploadAuthorizationError";
  }
}

function hash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function invalid(): never {
  throw new BrochureUploadAuthorizationError("INVALID_AUTHORIZATION");
}

export function createBrochureUploadAuthorizationService(
  client: PrismaClient,
  now = () => new Date(),
) {
  const brochureService = createTrainingSessionBrochureService(client);

  async function throttle(adminUserId: string, kind: BrochureUploadAttemptKind) {
    const current = now();
    const windowStart = new Date(Math.floor(current.getTime() / WINDOW_MS) * WINDOW_MS);
    // The compound-key upsert serializes concurrent increments in PostgreSQL.
    const counter = await client.brochureUploadAttempt.upsert({
      where: { adminUserId_kind_windowStart: { adminUserId, kind, windowStart } },
      create: { adminUserId, kind, windowStart, attempts: 1 },
      update: { attempts: { increment: 1 } },
    });
    if (counter.attempts > LIMITS[kind]) {
      throw new BrochureUploadAuthorizationError("THROTTLED");
    }
    // Bounded batch cleanup avoids growing counters indefinitely without touching authorization history.
    const stale = await client.brochureUploadAttempt.findMany({
      where: { windowStart: { lt: new Date(current.getTime() - RETENTION_MS) } },
      select: { adminUserId: true, kind: true, windowStart: true },
      take: 100,
    });
    if (stale.length) {
      await client.brochureUploadAttempt.deleteMany({
        where: {
          OR: stale.map((row) => ({
            adminUserId: row.adminUserId,
            kind: row.kind,
            windowStart: row.windowStart,
          })),
        },
      });
    }
  }

  async function validateInTransaction(
    tx: Prisma.TransactionClient,
    input: { adminUserId: string; sessionId: string; pendingBrochureId: string; secret: string },
  ) {
    if (!/^[a-f0-9]{64}$/.test(input.secret)) invalid();
    const authorization = await tx.trainingSessionBrochureUploadAuthorization.findUnique({
      where: { secretHash: hash(input.secret) },
      include: {
        pendingBrochure: {
          select: {
            trainingSessionId: true,
            state: true,
            storageKey: true,
            mimeType: true,
            byteSize: true,
            sha256: true,
          },
        },
      },
    });
    if (
      !authorization ||
      authorization.adminUserId !== input.adminUserId ||
      authorization.trainingSessionId !== input.sessionId ||
      authorization.pendingBrochureId !== input.pendingBrochureId ||
      authorization.pendingBrochure.trainingSessionId !== input.sessionId ||
      authorization.pendingBrochure.state !== TrainingSessionBrochureState.PENDING ||
      authorization.expiresAt <= now() ||
      authorization.consumedAt ||
      authorization.revokedAt
    )
      invalid();
    return authorization;
  }

  return {
    async isCompleted(
      input: {
        adminUserId: string;
        sessionId: string;
        pendingBrochureId: string;
        secret: string;
      },
      storageKey: string,
    ) {
      if (!/^[a-f0-9]{64}$/.test(input.secret)) return false;
      const authorization = await client.trainingSessionBrochureUploadAuthorization.findUnique({
        where: { secretHash: hash(input.secret) },
        select: {
          adminUserId: true,
          trainingSessionId: true,
          pendingBrochureId: true,
          consumedAt: true,
          pendingBrochure: { select: { state: true, storageKey: true } },
        },
      });
      return Boolean(
        authorization &&
          authorization.adminUserId === input.adminUserId &&
          authorization.trainingSessionId === input.sessionId &&
          authorization.pendingBrochureId === input.pendingBrochureId &&
          authorization.pendingBrochure.storageKey === storageKey &&
          authorization.consumedAt &&
          authorization.pendingBrochure.state !== TrainingSessionBrochureState.PENDING,
      );
    },
    async issue(input: {
      adminUserId: string;
      sessionId: string;
      pendingBrochureId: string;
      expectedActiveBrochureId: string | null;
    }) {
      await throttle(input.adminUserId, BrochureUploadAttemptKind.ISSUE);
      const secret = randomBytes(32).toString("hex");
      const authorization = await client.$transaction(async (tx) => {
        const locked = await tx.trainingSession.updateMany({
          where: { id: input.sessionId, status: { in: MUTABLE } },
          data: { updatedAt: now() },
        });
        if (locked.count !== 1) throw new BrochureUploadAuthorizationError("IMMUTABLE_SESSION");
        const pending = await tx.trainingSessionBrochure.findFirst({
          where: {
            id: input.pendingBrochureId,
            trainingSessionId: input.sessionId,
            state: TrainingSessionBrochureState.PENDING,
          },
        });
        if (!pending) invalid();
        const active = await tx.trainingSessionBrochure.findFirst({
          where: { trainingSessionId: input.sessionId, state: TrainingSessionBrochureState.ACTIVE },
          select: { id: true },
        });
        if ((active?.id ?? null) !== input.expectedActiveBrochureId) invalid();
        return tx.trainingSessionBrochureUploadAuthorization.create({
          data: {
            adminUserId: input.adminUserId,
            trainingSessionId: input.sessionId,
            pendingBrochureId: input.pendingBrochureId,
            expectedActiveBrochureId: input.expectedActiveBrochureId,
            secretHash: hash(secret),
            expiresAt: new Date(now().getTime() + AUTHORIZATION_MS),
          },
        });
      });
      return { id: authorization.id, secret, expiresAt: authorization.expiresAt };
    },

    async validate(input: {
      adminUserId: string;
      sessionId: string;
      pendingBrochureId: string;
      secret: string;
    }) {
      return client.$transaction((tx) => validateInTransaction(tx, input));
    },

    async finalize(
      input: {
        adminUserId: string;
        sessionId: string;
        pendingBrochureId: string;
        secret: string;
      },
      verified: VerifiedPrivateBrochureObject,
    ) {
      await throttle(input.adminUserId, BrochureUploadAttemptKind.FINALIZE);
      return brochureService.activateAuthorizedPendingBrochure(
        input.sessionId,
        input.pendingBrochureId,
        async (tx) => {
          const authorization = await validateInTransaction(tx, input);
          const pending = authorization.pendingBrochure;
          if (
            pending.storageKey !== verified.storageKey ||
            pending.mimeType !== verified.mimeType ||
            pending.byteSize !== verified.byteSize ||
            pending.sha256 !== verified.sha256
          )
            invalid();
          const consumed = await tx.trainingSessionBrochureUploadAuthorization.updateMany({
            where: {
              id: authorization.id,
              consumedAt: null,
              revokedAt: null,
              expiresAt: { gt: now() },
            },
            data: { consumedAt: now() },
          });
          if (consumed.count !== 1) invalid();
          return authorization.expectedActiveBrochureId;
        },
      );
    },

    async revoke(input: {
      adminUserId: string;
      sessionId: string;
      pendingBrochureId: string;
      secret: string;
    }) {
      return client.$transaction(async (tx) => {
        const authorization = await validateInTransaction(tx, input);
        return tx.trainingSessionBrochureUploadAuthorization.updateMany({
          where: { id: authorization.id, revokedAt: null, consumedAt: null },
          data: { revokedAt: now() },
        });
      });
    },
  };
}

export const brochureUploadAuthorizationService = createBrochureUploadAuthorizationService(prisma);
