import "server-only";

import {
  BrochureStorageProvider,
  Prisma,
  PrismaClient,
  SessionStatus,
  TrainingSessionBrochureState,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { MAX_BROCHURE_SIZE_BYTES } from "./session-brochure.constants";
import { TrainingSessionBrochureDomainError } from "./training-session-brochure.errors";

const MUTABLE_SESSION_STATUSES = [SessionStatus.DRAFT, SessionStatus.OPEN, SessionStatus.CLOSED];
export { MAX_BROCHURE_SIZE_BYTES } from "./session-brochure.constants";

type TransactionClient = Prisma.TransactionClient;

export type RegisterPendingBrochureInput = {
  storageProvider: BrochureStorageProvider;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
};

export type ActivateBrochureInput = {
  pendingBrochureId: string;
  expectedActiveBrochureId: string | null;
};

function domainError(
  code: ConstructorParameters<typeof TrainingSessionBrochureDomainError>[0],
  message: string,
): never {
  throw new TrainingSessionBrochureDomainError(code, message);
}

function isPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function sanitizeFilename(value: string) {
  const filename = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\/]/g, "-")
    .trim();

  if (!filename || filename === "." || filename === ".." || filename.length > 255) {
    domainError(
      "INVALID_BROCHURE_METADATA",
      "A brochure filename must be safe and no longer than 255 characters.",
    );
  }

  if (!/\.pdf$/i.test(filename)) {
    domainError("INVALID_BROCHURE_METADATA", "A brochure filename must use the PDF extension.");
  }

  return filename;
}

function normalizePendingInput(input: RegisterPendingBrochureInput): RegisterPendingBrochureInput {
  const storageKey = input.storageKey.trim();
  const mimeType = input.mimeType.trim().toLowerCase();
  const sha256 = input.sha256.trim().toLowerCase();

  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/.test(storageKey)) {
    domainError("INVALID_BROCHURE_METADATA", "A brochure storage key is invalid.");
  }

  if (mimeType !== "application/pdf") {
    domainError("INVALID_BROCHURE_METADATA", "A brochure must use the application/pdf MIME type.");
  }

  if (
    !Number.isInteger(input.byteSize) ||
    input.byteSize < 1 ||
    input.byteSize > MAX_BROCHURE_SIZE_BYTES
  ) {
    domainError("INVALID_BROCHURE_METADATA", "A brochure must be between 1 byte and 10 MB.");
  }

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    domainError("INVALID_BROCHURE_METADATA", "A brochure SHA-256 digest is invalid.");
  }

  return {
    ...input,
    storageKey,
    originalFilename: sanitizeFilename(input.originalFilename),
    mimeType,
    sha256,
  };
}

async function loadSession(tx: TransactionClient, sessionId: string) {
  const session = await tx.trainingSession.findUnique({ where: { id: sessionId } });

  if (!session) {
    domainError("SESSION_NOT_FOUND", "Training session was not found.");
  }

  return session;
}

async function lockMutableSession(tx: TransactionClient, sessionId: string) {
  const result = await tx.trainingSession.updateMany({
    where: { id: sessionId, status: { in: MUTABLE_SESSION_STATUSES } },
    data: { updatedAt: new Date() },
  });

  if (result.count !== 1) {
    domainError("SESSION_IMMUTABLE", "Completed and cancelled sessions are historical records.");
  }
}

function assertExpectedActiveBrochure(
  activeBrochureId: string | null,
  expectedActiveBrochureId: string | null,
) {
  if (activeBrochureId !== expectedActiveBrochureId) {
    domainError(
      "STALE_BROCHURE_STATE",
      "The active brochure changed before this mutation completed.",
    );
  }
}

export function createTrainingSessionBrochureService(client: PrismaClient) {
  return {
    async registerPendingBrochure(sessionId: string, input: RegisterPendingBrochureInput) {
      const brochure = normalizePendingInput(input);

      return client.$transaction(async (tx) => {
        await loadSession(tx, sessionId);
        await lockMutableSession(tx, sessionId);

        try {
          return await tx.trainingSessionBrochure.create({
            data: {
              trainingSessionId: sessionId,
              ...brochure,
              state: TrainingSessionBrochureState.PENDING,
            },
          });
        } catch (error) {
          if (isPrismaCode(error, "P2002")) {
            domainError(
              "BROCHURE_STORAGE_KEY_CONFLICT",
              "A brochure already uses this storage key.",
            );
          }

          throw error;
        }
      });
    },

    async activateValidatedPendingBrochure(sessionId: string, input: ActivateBrochureInput) {
      return client.$transaction(async (tx) => {
        await loadSession(tx, sessionId);
        await lockMutableSession(tx, sessionId);

        const activeBrochure = await tx.trainingSessionBrochure.findFirst({
          where: { trainingSessionId: sessionId, state: TrainingSessionBrochureState.ACTIVE },
          select: { id: true },
        });
        assertExpectedActiveBrochure(activeBrochure?.id ?? null, input.expectedActiveBrochureId);

        const pendingBrochure = await tx.trainingSessionBrochure.findFirst({
          where: {
            id: input.pendingBrochureId,
            trainingSessionId: sessionId,
            state: TrainingSessionBrochureState.PENDING,
          },
          select: { id: true },
        });

        if (!pendingBrochure) {
          const existingBrochure = await tx.trainingSessionBrochure.findUnique({
            where: { id: input.pendingBrochureId },
            select: { id: true },
          });

          domainError(
            existingBrochure ? "BROCHURE_NOT_PENDING" : "BROCHURE_NOT_FOUND",
            "The brochure is not a pending version for this session.",
          );
        }

        const now = new Date();

        if (activeBrochure) {
          const superseded = await tx.trainingSessionBrochure.updateMany({
            where: {
              id: activeBrochure.id,
              trainingSessionId: sessionId,
              state: TrainingSessionBrochureState.ACTIVE,
            },
            data: { state: TrainingSessionBrochureState.SUPERSEDED, replacedAt: now },
          });

          if (superseded.count !== 1) {
            domainError(
              "STALE_BROCHURE_STATE",
              "The active brochure changed before this replacement completed.",
            );
          }
        }

        const activated = await tx.trainingSessionBrochure.updateMany({
          where: {
            id: pendingBrochure.id,
            trainingSessionId: sessionId,
            state: TrainingSessionBrochureState.PENDING,
          },
          data: { state: TrainingSessionBrochureState.ACTIVE, activatedAt: now },
        });

        if (activated.count !== 1) {
          domainError(
            "STALE_BROCHURE_STATE",
            "The pending brochure changed before this activation completed.",
          );
        }

        return tx.trainingSessionBrochure.findUniqueOrThrow({ where: { id: pendingBrochure.id } });
      });
    },

    async removeActiveBrochure(sessionId: string, expectedActiveBrochureId: string) {
      return client.$transaction(async (tx) => {
        await loadSession(tx, sessionId);
        await lockMutableSession(tx, sessionId);

        const activeBrochure = await tx.trainingSessionBrochure.findFirst({
          where: { trainingSessionId: sessionId, state: TrainingSessionBrochureState.ACTIVE },
          select: { id: true },
        });

        if (!activeBrochure) {
          domainError("BROCHURE_NOT_ACTIVE", "The session has no active brochure.");
        }

        assertExpectedActiveBrochure(activeBrochure.id, expectedActiveBrochureId);

        const removed = await tx.trainingSessionBrochure.updateMany({
          where: {
            id: activeBrochure.id,
            trainingSessionId: sessionId,
            state: TrainingSessionBrochureState.ACTIVE,
          },
          data: { state: TrainingSessionBrochureState.REMOVED, removedAt: new Date() },
        });

        if (removed.count !== 1) {
          domainError(
            "STALE_BROCHURE_STATE",
            "The active brochure changed before this removal completed.",
          );
        }
      });
    },

    getActiveBrochure(sessionId: string) {
      return client.trainingSessionBrochure.findFirst({
        where: { trainingSessionId: sessionId, state: TrainingSessionBrochureState.ACTIVE },
      });
    },

    listBrochureHistory(sessionId: string) {
      return client.trainingSessionBrochure.findMany({
        where: { trainingSessionId: sessionId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    },
  };
}

export const trainingSessionBrochureService = createTrainingSessionBrochureService(prisma);
