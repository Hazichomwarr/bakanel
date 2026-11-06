import "server-only";

import { BrochureStorageProvider, TrainingSessionBrochureState } from "@prisma/client";

import { SessionBrochureStorageError } from "./session-brochure-storage.errors";
import type {
  PendingBrochureInspection,
  PrivateBrochureStorage,
  VerifiedPrivateBrochureObject,
} from "./session-brochure-storage";
import type { RegisterPendingBrochureInput } from "./training-session-brochure.service";

type BrochureVersion = RegisterPendingBrochureInput & {
  id: string;
  state: TrainingSessionBrochureState;
};

type BrochureDomainService = {
  registerPendingBrochure(
    sessionId: string,
    input: RegisterPendingBrochureInput,
  ): Promise<BrochureVersion>;
  activateValidatedPendingBrochure(
    sessionId: string,
    input: { pendingBrochureId: string; expectedActiveBrochureId: string | null },
  ): Promise<BrochureVersion>;
  listBrochureHistory(sessionId: string): Promise<BrochureVersion[]>;
};

function verificationMismatch(message: string): never {
  throw new SessionBrochureStorageError("BROCHURE_VERIFICATION_MISMATCH", message);
}

function assertVerifiedMetadata(pending: BrochureVersion, object: VerifiedPrivateBrochureObject) {
  if (
    pending.storageKey !== object.storageKey ||
    pending.mimeType !== object.mimeType ||
    pending.byteSize !== object.byteSize ||
    pending.sha256 !== object.sha256
  ) {
    verificationMismatch("The uploaded object does not match the pending brochure metadata.");
  }
}

/**
 * Coordinates storage verification with the FILE-1B domain boundary. It never uploads files
 * itself and never exposes a private Blob URL or token to callers.
 */
export function createSessionBrochureStorageWorkflow(
  storage: PrivateBrochureStorage,
  brochures: BrochureDomainService,
) {
  return {
    async preparePendingUpload(
      sessionId: string,
      input: Omit<RegisterPendingBrochureInput, "storageKey" | "storageProvider">,
    ) {
      const prepared = storage.prepareUpload(sessionId);
      const pending = await brochures.registerPendingBrochure(sessionId, {
        ...input,
        storageProvider: BrochureStorageProvider.VERCEL_BLOB,
        storageKey: prepared.storageKey,
      });

      return { pending, expiresAt: prepared.expiresAt };
    },

    async finalizePendingUpload(
      sessionId: string,
      input: { pendingBrochureId: string; expectedActiveBrochureId: string | null },
    ) {
      const history = await brochures.listBrochureHistory(sessionId);
      const version = history.find((item) => item.id === input.pendingBrochureId);

      if (!version) {
        throw new SessionBrochureStorageError(
          "STORAGE_OBJECT_NOT_FOUND",
          "The pending brochure version was not found.",
        );
      }

      if (version.state === TrainingSessionBrochureState.ACTIVE) {
        return version;
      }

      if (version.state !== TrainingSessionBrochureState.PENDING) {
        throw new SessionBrochureStorageError(
          "BROCHURE_VERIFICATION_MISMATCH",
          "Only a pending brochure version can be finalized.",
        );
      }

      const object = await storage.verifyUploadedObject(version.storageKey);
      assertVerifiedMetadata(version, object);

      return brochures.activateValidatedPendingBrochure(sessionId, input);
    },

    async reconcilePendingVersions(sessionId: string) {
      const history = await brochures.listBrochureHistory(sessionId);
      const pending = history.filter((item) => item.state === TrainingSessionBrochureState.PENDING);
      const inspections = await Promise.all(
        pending.map(async (version) => ({
          brochureId: version.id,
          inspection: await storage.inspectPendingUpload(version.storageKey),
        })),
      );

      return inspections as Array<{ brochureId: string; inspection: PendingBrochureInspection }>;
    },
  };
}
