import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { assertSafeTestDatabaseUrl } from "./database/disposable-database-guard";
import { SessionBrochureStorageError } from "./session-brochure-storage.errors";
import type {
  PrivateBrochureStorage,
  VerifiedPrivateBrochureObject,
} from "./session-brochure-storage";

type Stored = { bytes: Uint8Array; uploadedAt: Date; etag: string };
const objects = new Map<string, Stored>();

export function fakeBrochureStorageEnabled(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (environment.BAKANEL_FAKE_BROCHURE_STORAGE !== "1") return false;
  if (
    environment.BAKANEL_DISPOSABLE_DATABASE !== "1" ||
    environment.NODE_ENV === "production" ||
    environment.VERCEL_ENV === "production" ||
    environment.VERCEL_ENV === "preview"
  ) {
    throw new SessionBrochureStorageError(
      "STORAGE_CONFIGURATION_INVALID",
      "Fake brochure storage is restricted to the local disposable runtime.",
    );
  }
  assertSafeTestDatabaseUrl(environment);
  return true;
}

function verified(storageKey: string): VerifiedPrivateBrochureObject {
  const item = objects.get(storageKey);
  if (!item)
    throw new SessionBrochureStorageError("STORAGE_OBJECT_NOT_FOUND", "Missing fake object.");
  const text = new TextDecoder("latin1").decode(item.bytes);
  if (
    !/%PDF-1\.[0-9]/.test(text.slice(0, 1024)) ||
    !text.includes("/Type /Catalog") ||
    !text.includes("%%EOF")
  )
    throw new SessionBrochureStorageError("STORAGE_OBJECT_INVALID", "Invalid fake PDF.");
  return {
    storageKey,
    mimeType: "application/pdf",
    byteSize: item.bytes.byteLength,
    sha256: createHash("sha256").update(item.bytes).digest("hex"),
    uploadedAt: item.uploadedAt,
    etag: item.etag,
  };
}

export const fakeBrochureStorage: PrivateBrochureStorage & {
  put(key: string, bytes: Uint8Array): void;
} = {
  prepareUpload(sessionId) {
    return {
      storageKey: `test/session-brochures/${sessionId}/${randomUUID()}.pdf`,
      expiresAt: new Date(Date.now() + 300_000),
    };
  },
  put(storageKey, bytes) {
    objects.set(storageKey, { bytes, uploadedAt: new Date(), etag: randomUUID() });
  },
  async getMetadata(storageKey) {
    const item = objects.get(storageKey);
    return item
      ? {
          storageKey,
          mimeType: "application/pdf",
          byteSize: item.bytes.byteLength,
          uploadedAt: item.uploadedAt,
          etag: item.etag,
        }
      : null;
  },
  async verifyUploadedObject(storageKey) {
    return verified(storageKey);
  },
  async getPrivateObject(storageKey) {
    const item = objects.get(storageKey);
    return item
      ? {
          metadata: verified(storageKey),
          stream: new Blob([new Uint8Array(item.bytes).buffer]).stream(),
        }
      : null;
  },
  async inspectPendingUpload(storageKey) {
    try {
      return { status: "valid" as const, object: verified(storageKey) };
    } catch (error) {
      return error instanceof SessionBrochureStorageError &&
        error.code === "STORAGE_OBJECT_NOT_FOUND"
        ? { status: "missing" as const }
        : { status: "invalid" as const };
    }
  },
  async deleteObject() {},
};
