import {
  BrochureStorageProvider,
  SessionStatus,
  TrainingSessionBrochureState,
  type PrismaClient,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PrivateBrochureStorage,
  VerifiedPrivateBrochureObject,
} from "@/lib/session-brochure-storage";
import { SessionBrochureStorageError } from "@/lib/session-brochure-storage.errors";
import { createSessionBrochureStorageWorkflow } from "@/lib/session-brochure-storage.workflow";
import { createBrochureUploadAuthorizationService } from "@/lib/training-session-brochure-authorization.service";
import { createTrainingSessionBrochureService } from "@/lib/training-session-brochure.service";

import { createPublishedTraining, resetPublicContent } from "./support/fixtures";
import { createTestPrismaClient } from "./support/test-prisma";

/**
 * Authenticated finalization (FILE-2C.7) against PostgreSQL: the real authorization and brochure
 * services, with an in-memory stand-in for the private object store. The HTTP boundary is covered
 * by mocked route tests; this file proves the durable lifecycle and consumption behavior.
 */

let client: PrismaClient;

type StoredObject = { bytes: string; valid: boolean };

function inMemoryPrivateStore() {
  const objects = new Map<string, StoredObject>();
  const verifyUploadedObject = vi.fn(
    async (storageKey: string): Promise<VerifiedPrivateBrochureObject> => {
      const object = objects.get(storageKey);

      if (!object) {
        throw new SessionBrochureStorageError("STORAGE_OBJECT_NOT_FOUND", "Missing object.");
      }

      if (!object.valid) {
        throw new SessionBrochureStorageError("STORAGE_OBJECT_INVALID", "Malformed PDF.");
      }

      return {
        storageKey,
        mimeType: "application/pdf",
        byteSize: 1024,
        sha256: createHash("sha256").update(object.bytes).digest("hex"),
        uploadedAt: new Date(),
        etag: "it-etag",
      };
    },
  );
  const storage: PrivateBrochureStorage = {
    prepareUpload: vi.fn(),
    getMetadata: vi.fn(),
    verifyUploadedObject,
    getPrivateObject: vi.fn(),
    inspectPendingUpload: vi.fn(),
    deleteObject: vi.fn(),
  };

  return {
    storage,
    verifyUploadedObject,
    transfer(storageKey: string, bytes: string, valid = true) {
      objects.set(storageKey, { bytes, valid });
    },
  };
}

async function createSession() {
  const training = await createPublishedTraining(client, `finalize-${crypto.randomUUID()}`);

  return client.trainingSession.create({
    data: {
      trainingId: training.id,
      status: SessionStatus.DRAFT,
      startDate: new Date("2026-12-10T00:00:00.000Z"),
      endDate: new Date("2026-12-11T00:00:00.000Z"),
      registrationDeadline: new Date("2026-12-01T00:00:00.000Z"),
      deliveryMode: "IN_PERSON",
      country: "BF",
      city: "it-Ouagadougou",
      venue: "it-venue",
      pricingMode: "ON_REQUEST",
      price: null,
      currency: null,
      capacity: 25,
    },
  });
}

async function createAdmin(name: string) {
  return client.adminUser.create({
    data: { email: `it-${crypto.randomUUID()}@example.test`, name, passwordHash: "it-hash" },
  });
}

/** Registers a pending version whose checksum matches `bytes`, and issues its authorization. */
async function authorizedPendingUpload(input: {
  sessionId: string;
  adminUserId: string;
  bytes: string;
  expectedActiveBrochureId?: string | null;
}) {
  const brochures = createTrainingSessionBrochureService(client);
  const authorizations = createBrochureUploadAuthorizationService(client);
  const pending = await brochures.registerPendingBrochure(input.sessionId, {
    storageProvider: BrochureStorageProvider.VERCEL_BLOB,
    storageKey: `test/session-brochures/${input.sessionId}/${crypto.randomUUID()}.pdf`,
    originalFilename: "Brochure.pdf",
    mimeType: "application/pdf",
    byteSize: 1024,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
  });
  const issued = await authorizations.issue({
    adminUserId: input.adminUserId,
    sessionId: input.sessionId,
    pendingBrochureId: pending.id,
    expectedActiveBrochureId: input.expectedActiveBrochureId ?? null,
  });

  return {
    pending,
    authorizationId: issued.id,
    identity: {
      adminUserId: input.adminUserId,
      sessionId: input.sessionId,
      pendingBrochureId: pending.id,
      secret: issued.secret,
    },
  };
}

function workflowWith(storage: PrivateBrochureStorage) {
  return createSessionBrochureStorageWorkflow(
    storage,
    createTrainingSessionBrochureService(client),
    createBrochureUploadAuthorizationService(client),
  );
}

async function brochureState(id: string) {
  const brochure = await client.trainingSessionBrochure.findUniqueOrThrow({ where: { id } });
  return brochure.state;
}

async function authorizationConsumedAt(id: string) {
  const authorization = await client.trainingSessionBrochureUploadAuthorization.findUniqueOrThrow({
    where: { id },
  });
  return authorization.consumedAt;
}

beforeAll(() => {
  client = createTestPrismaClient();
});

beforeEach(async () => {
  await resetPublicContent(client);
});

afterAll(async () => {
  await resetPublicContent(client);
  await client.$disconnect();
});

describe("authenticated brochure finalization against PostgreSQL", () => {
  it("activates the transferred object and records completion for this authorization only", async () => {
    const session = await createSession();
    const admin = await createAdmin("it-admin");
    const other = await createAdmin("it-other");
    const store = inMemoryPrivateStore();
    const upload = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-a",
    });
    store.transfer(upload.pending.storageKey, "pdf-a");

    await expect(
      workflowWith(store.storage).finalizeAuthorizedUpload(upload.identity),
    ).resolves.toMatchObject({ id: upload.pending.id, state: TrainingSessionBrochureState.ACTIVE });

    const authorizations = createBrochureUploadAuthorizationService(client);
    expect(store.verifyUploadedObject).toHaveBeenCalledWith(upload.pending.storageKey);
    expect(await authorizationConsumedAt(upload.authorizationId)).toEqual(expect.any(Date));
    await expect(
      authorizations.isCompleted(upload.identity, upload.pending.storageKey),
    ).resolves.toBe(true);
    await expect(
      authorizations.isCompleted(
        { ...upload.identity, adminUserId: other.id },
        upload.pending.storageKey,
      ),
    ).resolves.toBe(false);
    await expect(
      authorizations.isCompleted(upload.identity, "test/session-brochures/substituted.pdf"),
    ).resolves.toBe(false);
  });

  it("rejects duplicate finalization without changing the active version", async () => {
    const session = await createSession();
    const admin = await createAdmin("it-admin");
    const store = inMemoryPrivateStore();
    const upload = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-a",
    });
    store.transfer(upload.pending.storageKey, "pdf-a");
    const workflow = workflowWith(store.storage);
    await workflow.finalizeAuthorizedUpload(upload.identity);

    await expect(workflow.finalizeAuthorizedUpload(upload.identity)).rejects.toMatchObject({
      code: "INVALID_AUTHORIZATION",
    });

    expect(await brochureState(upload.pending.id)).toBe(TrainingSessionBrochureState.ACTIVE);
    expect(
      await client.trainingSessionBrochure.count({
        where: { trainingSessionId: session.id, state: TrainingSessionBrochureState.ACTIVE },
      }),
    ).toBe(1);
  });

  it("rejects another administrator, another session, and revoked or expired authorizations before reading storage", async () => {
    const session = await createSession();
    const otherSession = await createSession();
    const admin = await createAdmin("it-admin");
    const other = await createAdmin("it-other");
    const store = inMemoryPrivateStore();
    const authorizations = createBrochureUploadAuthorizationService(client);
    const revoked = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-revoked",
    });
    store.transfer(revoked.pending.storageKey, "pdf-revoked");
    const workflow = workflowWith(store.storage);

    await expect(
      workflow.finalizeAuthorizedUpload({ ...revoked.identity, adminUserId: other.id }),
    ).rejects.toMatchObject({ code: "INVALID_AUTHORIZATION" });
    await expect(
      workflow.finalizeAuthorizedUpload({ ...revoked.identity, sessionId: otherSession.id }),
    ).rejects.toMatchObject({ code: "INVALID_AUTHORIZATION" });

    await authorizations.revoke(revoked.identity);
    await expect(workflow.finalizeAuthorizedUpload(revoked.identity)).rejects.toMatchObject({
      code: "INVALID_AUTHORIZATION",
    });

    const expired = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-expired",
    });
    store.transfer(expired.pending.storageKey, "pdf-expired");
    await client.trainingSessionBrochureUploadAuthorization.update({
      where: { id: expired.authorizationId },
      data: { expiresAt: new Date(0) },
    });
    await expect(workflow.finalizeAuthorizedUpload(expired.identity)).rejects.toMatchObject({
      code: "INVALID_AUTHORIZATION",
    });

    expect(store.verifyUploadedObject).not.toHaveBeenCalled();
    expect(await brochureState(revoked.pending.id)).toBe(TrainingSessionBrochureState.PENDING);
    expect(await brochureState(expired.pending.id)).toBe(TrainingSessionBrochureState.PENDING);
  });

  it("leaves the version pending and the authorization unconsumed for a missing or malformed object", async () => {
    const session = await createSession();
    const admin = await createAdmin("it-admin");
    const store = inMemoryPrivateStore();
    const upload = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-a",
    });
    const workflow = workflowWith(store.storage);

    await expect(workflow.finalizeAuthorizedUpload(upload.identity)).rejects.toMatchObject({
      code: "STORAGE_OBJECT_NOT_FOUND",
    });
    store.transfer(upload.pending.storageKey, "pdf-a", false);
    await expect(workflow.finalizeAuthorizedUpload(upload.identity)).rejects.toMatchObject({
      code: "STORAGE_OBJECT_INVALID",
    });
    store.transfer(upload.pending.storageKey, "substituted-content");
    await expect(workflow.finalizeAuthorizedUpload(upload.identity)).rejects.toMatchObject({
      code: "BROCHURE_VERIFICATION_MISMATCH",
    });

    expect(await brochureState(upload.pending.id)).toBe(TrainingSessionBrochureState.PENDING);
    expect(await authorizationConsumedAt(upload.authorizationId)).toBeNull();
    await expect(
      client.trainingSessionBrochure.count({
        where: { trainingSessionId: session.id, state: TrainingSessionBrochureState.ACTIVE },
      }),
    ).resolves.toBe(0);
  });

  it("resumes an interrupted finalization with the same unexpired authorization", async () => {
    const session = await createSession();
    const admin = await createAdmin("it-admin");
    const store = inMemoryPrivateStore();
    const upload = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-a",
    });
    const workflow = workflowWith(store.storage);
    await expect(workflow.finalizeAuthorizedUpload(upload.identity)).rejects.toMatchObject({
      code: "STORAGE_OBJECT_NOT_FOUND",
    });

    store.transfer(upload.pending.storageKey, "pdf-a");

    await expect(workflow.finalizeAuthorizedUpload(upload.identity)).resolves.toMatchObject({
      id: upload.pending.id,
      state: TrainingSessionBrochureState.ACTIVE,
    });
    expect(await authorizationConsumedAt(upload.authorizationId)).toEqual(expect.any(Date));
  });

  it("rejects a stale replacement and preserves the version that superseded it", async () => {
    const session = await createSession();
    const admin = await createAdmin("it-admin");
    const store = inMemoryPrivateStore();
    const workflow = workflowWith(store.storage);
    const first = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-first",
    });
    const stale = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-stale",
    });
    store.transfer(first.pending.storageKey, "pdf-first");
    store.transfer(stale.pending.storageKey, "pdf-stale");

    await workflow.finalizeAuthorizedUpload(first.identity);

    await expect(workflow.finalizeAuthorizedUpload(stale.identity)).rejects.toMatchObject({
      code: "STALE_BROCHURE_STATE",
    });
    expect(await brochureState(first.pending.id)).toBe(TrainingSessionBrochureState.ACTIVE);
    expect(await brochureState(stale.pending.id)).toBe(TrainingSessionBrochureState.PENDING);
    expect(await authorizationConsumedAt(stale.authorizationId)).toBeNull();
  });

  it("serializes concurrent finalizations of competing versions to one active brochure", async () => {
    const session = await createSession();
    const admin = await createAdmin("it-admin");
    const store = inMemoryPrivateStore();
    const workflow = workflowWith(store.storage);
    const left = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-left",
    });
    const right = await authorizedPendingUpload({
      sessionId: session.id,
      adminUserId: admin.id,
      bytes: "pdf-right",
    });
    store.transfer(left.pending.storageKey, "pdf-left");
    store.transfer(right.pending.storageKey, "pdf-right");

    const results = await Promise.allSettled([
      workflow.finalizeAuthorizedUpload(left.identity),
      workflow.finalizeAuthorizedUpload(right.identity),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await client.trainingSessionBrochure.count({
        where: { trainingSessionId: session.id, state: TrainingSessionBrochureState.ACTIVE },
      }),
    ).toBe(1);
  });
});
