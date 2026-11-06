import { createHash } from "node:crypto";

import { BrochureStorageProvider, TrainingSessionBrochureState } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVercelPrivateBrochureStorage,
  resolveVercelPrivateBlobConfiguration,
  type VercelBlobApi,
} from "../lib/session-brochure-storage";
import { SessionBrochureStorageError } from "../lib/session-brochure-storage.errors";
import { createSessionBrochureStorageWorkflow } from "../lib/session-brochure-storage.workflow";

const configuration = {
  environment: "preview" as const,
  storeId: "store_preview_123",
  token: "vercel_blob_secret",
};

const validPdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");

function blobUrl() {
  return `https://${configuration.storeId}.private.blob.vercel-storage.com/preview/session-brochures/file.pdf`;
}

function streamFor(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function fakeApi(bytes: Uint8Array = validPdf): VercelBlobApi {
  const etag = `etag-${bytes.byteLength}`;
  const metadata = {
    cacheControl: "no-store",
    contentDisposition: "attachment",
    contentType: "application/pdf",
    downloadUrl: blobUrl(),
    etag,
    pathname: "preview/session-brochures/file.pdf",
    size: bytes.byteLength,
    uploadedAt: new Date("2026-11-06T12:00:00.000Z"),
    url: blobUrl(),
  };

  return {
    head: vi.fn(async () => metadata),
    get: vi.fn(async () => ({
      statusCode: 200 as const,
      stream: streamFor(bytes),
      headers: new Headers(),
      blob: metadata,
    })),
    del: vi.fn(async () => undefined),
  };
}

function expectStorageError(promise: Promise<unknown>, code: SessionBrochureStorageError["code"]) {
  return expect(promise).rejects.toMatchObject({
    name: "SessionBrochureStorageError",
    code,
  });
}

describe("private session brochure storage configuration", () => {
  it("requires an explicit Vercel production or preview environment", () => {
    expect(() =>
      resolveVercelPrivateBlobConfiguration({
        VERCEL_ENV: "development",
        SESSION_BROCHURE_BLOB_ENVIRONMENT: "development",
        SESSION_BROCHURE_BLOB_STORE_ID: configuration.storeId,
        SESSION_BROCHURE_BLOB_TOKEN: configuration.token,
      }),
    ).toThrowError("explicit Vercel production or preview environments");
  });

  it("requires the configured store environment to match Vercel", () => {
    expect(() =>
      resolveVercelPrivateBlobConfiguration({
        VERCEL_ENV: "production",
        SESSION_BROCHURE_BLOB_ENVIRONMENT: "preview",
        SESSION_BROCHURE_BLOB_STORE_ID: configuration.storeId,
        SESSION_BROCHURE_BLOB_TOKEN: configuration.token,
      }),
    ).toThrowError("exactly match the Vercel deployment environment");
  });

  it("fails closed when private store credentials are missing", () => {
    expect(() =>
      resolveVercelPrivateBlobConfiguration({
        VERCEL_ENV: "preview",
        SESSION_BROCHURE_BLOB_ENVIRONMENT: "preview",
        SESSION_BROCHURE_BLOB_STORE_ID: configuration.storeId,
      }),
    ).toThrowError("configured private store and credential");
  });

  it("rejects malformed configuration passed directly to the adapter", () => {
    expect(() =>
      createVercelPrivateBrochureStorage(
        {
          environment: "preview",
          storeId: "bad",
          token: "token",
        },
        fakeApi(),
      ),
    ).toThrowError("valid private store configuration");
  });

  it("does not include credentials in configuration errors", () => {
    const secret = "super-secret-blob-token";

    expect(() =>
      resolveVercelPrivateBlobConfiguration({
        VERCEL_ENV: "preview",
        SESSION_BROCHURE_BLOB_ENVIRONMENT: "production",
        SESSION_BROCHURE_BLOB_STORE_ID: configuration.storeId,
        SESSION_BROCHURE_BLOB_TOKEN: secret,
      }),
    ).toThrowError(new RegExp("^(?!.*super-secret-blob-token).*$"));
  });
});

describe("private session brochure storage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an unpredictable environment-scoped upload key", () => {
    const storage = createVercelPrivateBrochureStorage(configuration, fakeApi());
    const first = storage.prepareUpload("123e4567-e89b-12d3-a456-426614174000");
    const second = storage.prepareUpload("123e4567-e89b-12d3-a456-426614174000");

    expect(first.storageKey).toMatch(
      /^preview\/session-brochures\/123e4567-e89b-12d3-a456-426614174000\/.+\.pdf$/,
    );
    expect(first.storageKey).not.toBe(second.storageKey);
    expect(first.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("verifies PDF content, metadata, and digest before activation", async () => {
    const storage = createVercelPrivateBrochureStorage(configuration, fakeApi());
    const verified = await storage.verifyUploadedObject(
      "preview/session-brochures/session/file.pdf",
    );

    expect(verified).toMatchObject({
      mimeType: "application/pdf",
      byteSize: validPdf.byteLength,
      sha256: createHash("sha256").update(validPdf).digest("hex"),
    });
  });

  it("rejects forged MIME metadata", async () => {
    const api = fakeApi();
    api.head = vi.fn(async () => ({
      cacheControl: "no-store",
      contentDisposition: "attachment",
      contentType: "text/plain",
      downloadUrl: blobUrl(),
      etag: "etag",
      pathname: "preview/session-brochures/file.pdf",
      size: validPdf.byteLength,
      uploadedAt: new Date(),
      url: blobUrl(),
    }));
    const storage = createVercelPrivateBrochureStorage(configuration, api);

    await expectStorageError(
      storage.verifyUploadedObject("preview/session-brochures/session/file.pdf"),
      "STORAGE_OBJECT_INVALID",
    );
  });

  it("rejects objects larger than 10 MB before reading their content", async () => {
    const api = fakeApi();
    api.head = vi.fn(async () => ({
      cacheControl: "no-store",
      contentDisposition: "attachment",
      contentType: "application/pdf",
      downloadUrl: blobUrl(),
      etag: "etag-large",
      pathname: "preview/session-brochures/file.pdf",
      size: 10 * 1024 * 1024 + 1,
      uploadedAt: new Date(),
      url: blobUrl(),
    }));
    const storage = createVercelPrivateBrochureStorage(configuration, api);

    await expectStorageError(
      storage.verifyUploadedObject("preview/session-brochures/session/file.pdf"),
      "STORAGE_OBJECT_INVALID",
    );
    expect(api.get).not.toHaveBeenCalled();
  });

  it("rejects non-PDF and truncated content", async () => {
    const nonPdf = new TextEncoder().encode("not a pdf");
    const nonPdfStorage = createVercelPrivateBrochureStorage(configuration, fakeApi(nonPdf));
    await expectStorageError(
      nonPdfStorage.verifyUploadedObject("preview/session-brochures/session/file.pdf"),
      "STORAGE_OBJECT_INVALID",
    );

    const truncated = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
    const truncatedStorage = createVercelPrivateBrochureStorage(configuration, fakeApi(truncated));
    await expectStorageError(
      truncatedStorage.verifyUploadedObject("preview/session-brochures/session/file.pdf"),
      "STORAGE_OBJECT_INVALID",
    );
  });

  it("rejects keys outside the configured environment namespace", async () => {
    const storage = createVercelPrivateBrochureStorage(configuration, fakeApi());

    await expectStorageError(
      storage.getMetadata("production/session-brochures/session/file.pdf"),
      "STORAGE_CONFIGURATION_INVALID",
    );
  });

  it("maps provider failures to a sanitized storage error", async () => {
    const api = fakeApi();
    api.head = vi.fn(async () => {
      throw new Error("token=do-not-leak");
    });
    const storage = createVercelPrivateBrochureStorage(configuration, api);

    await expectStorageError(
      storage.getMetadata("preview/session-brochures/session/file.pdf"),
      "STORAGE_PROVIDER_FAILURE",
    );
  });

  it("requires retention approval before deletion and uses an ETag precondition", async () => {
    const api = fakeApi();
    const storage = createVercelPrivateBrochureStorage(configuration, api);
    const input = {
      storageKey: "preview/session-brochures/session/file.pdf",
      etag: "etag-55",
      retentionSatisfied: false,
    };

    await expectStorageError(storage.deleteObject(input), "STORAGE_RETENTION_NOT_SATISFIED");
    await storage.deleteObject({ ...input, retentionSatisfied: true });
    expect(api.del).toHaveBeenCalledWith(input.storageKey, {
      storeId: configuration.storeId,
      token: configuration.token,
      ifMatch: input.etag,
    });
  });
});

describe("session brochure storage workflow", () => {
  it("does not activate an already-active brochure twice", async () => {
    const storage = {
      prepareUpload: vi.fn(),
      verifyUploadedObject: vi.fn(),
      inspectPendingUpload: vi.fn(),
      getMetadata: vi.fn(),
      getPrivateObject: vi.fn(),
      deleteObject: vi.fn(),
    };
    const active = {
      id: "brochure-1",
      trainingSessionId: "session-1",
      storageProvider: BrochureStorageProvider.VERCEL_BLOB,
      storageKey: "preview/session-brochures/session/file.pdf",
      originalFilename: "guide.pdf",
      mimeType: "application/pdf",
      byteSize: validPdf.byteLength,
      sha256: "a".repeat(64),
      state: TrainingSessionBrochureState.ACTIVE,
    };
    const brochures = {
      registerPendingBrochure: vi.fn(),
      activateValidatedPendingBrochure: vi.fn(),
      listBrochureHistory: vi.fn(async () => [active]),
    };
    const workflow = createSessionBrochureStorageWorkflow(storage, brochures);

    await expect(
      workflow.finalizePendingUpload("session-1", {
        pendingBrochureId: active.id,
        expectedActiveBrochureId: null,
      }),
    ).resolves.toEqual(active);
    expect(storage.verifyUploadedObject).not.toHaveBeenCalled();
    expect(brochures.activateValidatedPendingBrochure).not.toHaveBeenCalled();
  });

  it("reports pending objects without deleting or activating them", async () => {
    const storage = {
      prepareUpload: vi.fn(),
      verifyUploadedObject: vi.fn(),
      inspectPendingUpload: vi.fn(async () => ({ status: "missing" as const })),
      getMetadata: vi.fn(),
      getPrivateObject: vi.fn(),
      deleteObject: vi.fn(),
    };
    const brochures = {
      registerPendingBrochure: vi.fn(),
      activateValidatedPendingBrochure: vi.fn(),
      listBrochureHistory: vi.fn(async () => [
        {
          id: "brochure-pending",
          trainingSessionId: "session-1",
          storageProvider: BrochureStorageProvider.VERCEL_BLOB,
          storageKey: "preview/session-brochures/session/file.pdf",
          originalFilename: "guide.pdf",
          mimeType: "application/pdf",
          byteSize: validPdf.byteLength,
          sha256: "a".repeat(64),
          state: TrainingSessionBrochureState.PENDING,
        },
      ]),
    };
    const workflow = createSessionBrochureStorageWorkflow(storage, brochures);

    await expect(workflow.reconcilePendingVersions("session-1")).resolves.toEqual([
      { brochureId: "brochure-pending", inspection: { status: "missing" } },
    ]);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(brochures.activateValidatedPendingBrochure).not.toHaveBeenCalled();
  });
});
