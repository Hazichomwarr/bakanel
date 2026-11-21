import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { del, get, head, type GetBlobResult, type HeadBlobResult } from "@vercel/blob";
import { headers } from "next/headers";

import { MAX_BROCHURE_SIZE_BYTES } from "./session-brochure.constants";
import { SessionBrochureStorageError } from "./session-brochure-storage.errors";

const PDF_MIME_TYPE = "application/pdf";
const PDF_HEADER_SCAN_BYTES = 1024;
const PDF_TRAILER_SCAN_BYTES = 1024;
const UPLOAD_TICKET_TTL_MS = 5 * 60 * 1000;

type Environment = Readonly<Record<string, string | undefined>>;

export type PrivateBrochureObjectMetadata = {
  storageKey: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: Date;
  etag: string;
};

export type VerifiedPrivateBrochureObject = PrivateBrochureObjectMetadata & {
  sha256: string;
};

export type PreparedBrochureUpload = {
  storageKey: string;
  expiresAt: Date;
};

export type PrivateBrochureObject = {
  metadata: PrivateBrochureObjectMetadata;
  stream: ReadableStream<Uint8Array>;
};

export type PendingBrochureInspection =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "valid"; object: VerifiedPrivateBrochureObject };

export type PrivateBrochureStorage = {
  prepareUpload(sessionId: string): PreparedBrochureUpload;
  getMetadata(storageKey: string): Promise<PrivateBrochureObjectMetadata | null>;
  verifyUploadedObject(storageKey: string): Promise<VerifiedPrivateBrochureObject>;
  getPrivateObject(storageKey: string): Promise<PrivateBrochureObject | null>;
  inspectPendingUpload(storageKey: string): Promise<PendingBrochureInspection>;
  deleteObject(input: {
    storageKey: string;
    etag: string;
    retentionSatisfied: boolean;
  }): Promise<void>;
};

export type VercelPrivateBlobConfiguration = {
  environment: "production" | "preview";
  storeId: string;
  webhookPublicKey: string;
};

export type RuntimeOidcTokenResolver = () => Promise<string>;

export type VercelBlobApi = {
  head(key: string, options: { oidcToken: string; storeId: string }): Promise<HeadBlobResult>;
  get(
    key: string,
    options: {
      access: "private";
      oidcToken: string;
      useCache: false;
      storeId: string;
    },
  ): Promise<GetBlobResult | null>;
  del(key: string, options: { oidcToken: string; storeId: string; ifMatch: string }): Promise<void>;
};

const vercelBlobApi: VercelBlobApi = { del, get, head };

function assertConfiguration(configuration: VercelPrivateBlobConfiguration) {
  if (
    (configuration.environment !== "production" && configuration.environment !== "preview") ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(configuration.storeId) ||
    !configuration.webhookPublicKey.trim()
  ) {
    storageError(
      "STORAGE_CONFIGURATION_INVALID",
      "Private brochure storage requires a valid private store configuration.",
    );
  }
}

function storageError(
  code: ConstructorParameters<typeof SessionBrochureStorageError>[0],
  message: string,
): never {
  throw new SessionBrochureStorageError(code, message);
}

function isMissingObjectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "BlobNotFoundError"
  );
}

function privateBlobHost(storeId: string) {
  return storeId + ".private.blob.vercel-storage.com";
}

function assertPrivateBlobUrl(url: string, configuration: VercelPrivateBlobConfiguration) {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    storageError(
      "STORAGE_PROVIDER_FAILURE",
      "The storage provider returned an invalid object URL.",
    );
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== privateBlobHost(configuration.storeId)) {
    storageError(
      "STORAGE_PROVIDER_FAILURE",
      "The storage provider returned an object from an unexpected store.",
    );
  }
}

function toMetadata(
  storageKey: string,
  blob: Pick<HeadBlobResult, "contentType" | "etag" | "size" | "uploadedAt" | "url">,
  configuration: VercelPrivateBlobConfiguration,
): PrivateBrochureObjectMetadata {
  assertPrivateBlobUrl(blob.url, configuration);

  return {
    storageKey,
    mimeType: blob.contentType.trim().toLowerCase(),
    byteSize: blob.size,
    uploadedAt: blob.uploadedAt,
    etag: blob.etag,
  };
}

function validateMetadata(metadata: PrivateBrochureObjectMetadata) {
  if (metadata.mimeType !== PDF_MIME_TYPE) {
    storageError(
      "STORAGE_OBJECT_INVALID",
      "The stored brochure does not declare the PDF MIME type.",
    );
  }

  if (
    !Number.isInteger(metadata.byteSize) ||
    metadata.byteSize < 1 ||
    metadata.byteSize > MAX_BROCHURE_SIZE_BYTES
  ) {
    storageError("STORAGE_OBJECT_INVALID", "The stored brochure exceeds the permitted size.");
  }
}

function assertStorageKey(storageKey: string, environment: VercelPrivateBlobConfiguration) {
  const expectedPrefix = `${environment.environment}/session-brochures/`;

  if (
    !storageKey.startsWith(expectedPrefix) ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/.test(storageKey)
  ) {
    storageError("STORAGE_CONFIGURATION_INVALID", "The brochure storage key is invalid.");
  }
}

function validatePdfBytes(bytes: Uint8Array) {
  if (bytes.byteLength < 16) {
    storageError("STORAGE_OBJECT_INVALID", "The stored brochure is too short to be a PDF.");
  }

  const decoder = new TextDecoder("latin1");
  const header = decoder.decode(
    bytes.subarray(0, Math.min(bytes.byteLength, PDF_HEADER_SCAN_BYTES)),
  );
  const trailer = decoder.decode(
    bytes.subarray(Math.max(0, bytes.byteLength - PDF_TRAILER_SCAN_BYTES)),
  );
  const document = decoder.decode(bytes);

  if (!/%PDF-1\.[0-9]/.test(header)) {
    storageError(
      "STORAGE_OBJECT_INVALID",
      "The stored brochure does not contain a valid PDF header.",
    );
  }

  if (!trailer.includes("%%EOF")) {
    storageError("STORAGE_OBJECT_INVALID", "The stored brochure is truncated.");
  }

  if (!document.includes("/Type /Catalog")) {
    storageError("STORAGE_OBJECT_INVALID", "The stored brochure does not contain a PDF catalogue.");
  }
}

async function readBytes(result: GetBlobResult, expectedSize: number) {
  if (result.statusCode !== 200 || !result.stream) {
    storageError(
      "STORAGE_PROVIDER_FAILURE",
      "The storage provider did not return brochure content.",
    );
  }

  const buffer = await new Response(result.stream).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.byteLength !== expectedSize || bytes.byteLength > MAX_BROCHURE_SIZE_BYTES) {
    storageError("STORAGE_OBJECT_INVALID", "The stored brochure has an unexpected size.");
  }

  return bytes;
}

export function resolveVercelPrivateBlobConfiguration(
  environment: Environment,
): VercelPrivateBlobConfiguration {
  const deploymentEnvironment = environment.VERCEL_ENV?.trim();
  const configuredEnvironment = environment.SESSION_BROCHURE_BLOB_ENVIRONMENT?.trim();
  const storeId = environment.BLOB_STORE_ID?.trim();
  const webhookPublicKey = environment.BLOB_WEBHOOK_PUBLIC_KEY?.trim();

  if (deploymentEnvironment !== "production" && deploymentEnvironment !== "preview") {
    storageError(
      "STORAGE_CONFIGURATION_INVALID",
      "Private brochure storage is available only in explicit Vercel production or preview environments.",
    );
  }

  if (configuredEnvironment !== deploymentEnvironment) {
    storageError(
      "STORAGE_CONFIGURATION_INVALID",
      "The brochure storage environment must exactly match the Vercel deployment environment.",
    );
  }

  if (!storeId || !/^[A-Za-z0-9_-]{8,128}$/.test(storeId) || !webhookPublicKey) {
    storageError(
      "STORAGE_CONFIGURATION_INVALID",
      "Private brochure storage requires a configured private store and webhook verification key.",
    );
  }

  return {
    environment: deploymentEnvironment,
    storeId,
    webhookPublicKey,
  };
}

/**
 * Vercel supplies this credential in the request context of a Function invocation.
 * Passing it explicitly to Blob calls prevents a static-token fallback.
 */
export async function resolveRuntimeOidcToken() {
  const token = (await headers()).get("x-vercel-oidc-token")?.trim();

  if (!token) {
    storageError(
      "STORAGE_CONFIGURATION_INVALID",
      "Private brochure storage requires a Vercel runtime OIDC credential.",
    );
  }

  return token;
}

export function createVercelPrivateBrochureStorage(
  configuration: VercelPrivateBlobConfiguration,
  api: VercelBlobApi = vercelBlobApi,
  getOidcToken: RuntimeOidcTokenResolver = resolveRuntimeOidcToken,
): PrivateBrochureStorage {
  assertConfiguration(configuration);

  async function options() {
    return {
      storeId: configuration.storeId,
      oidcToken: await getOidcToken(),
    };
  }

  async function getMetadata(storageKey: string): Promise<PrivateBrochureObjectMetadata | null> {
    assertStorageKey(storageKey, configuration);

    try {
      const blob = await api.head(storageKey, await options());
      return toMetadata(storageKey, blob, configuration);
    } catch (error) {
      if (isMissingObjectError(error)) {
        return null;
      }

      if (error instanceof SessionBrochureStorageError) {
        throw error;
      }

      storageError("STORAGE_PROVIDER_FAILURE", "The private brochure store is unavailable.");
    }
  }

  return {
    prepareUpload(sessionId: string) {
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
        storageError(
          "STORAGE_CONFIGURATION_INVALID",
          "A brochure upload requires a valid session identifier.",
        );
      }

      return {
        storageKey:
          configuration.environment +
          "/session-brochures/" +
          sessionId +
          "/" +
          randomUUID() +
          ".pdf",
        expiresAt: new Date(Date.now() + UPLOAD_TICKET_TTL_MS),
      };
    },

    getMetadata,

    async verifyUploadedObject(storageKey: string) {
      const metadata = await getMetadata(storageKey);

      if (!metadata) {
        storageError("STORAGE_OBJECT_NOT_FOUND", "The pending brochure object was not found.");
      }

      validateMetadata(metadata);

      let result: GetBlobResult | null;

      try {
        result = await api.get(storageKey, {
          ...(await options()),
          access: "private",
          useCache: false,
        });
      } catch {
        storageError("STORAGE_PROVIDER_FAILURE", "The private brochure store is unavailable.");
      }

      if (!result) {
        storageError("STORAGE_OBJECT_NOT_FOUND", "The pending brochure object was not found.");
      }

      const contentMetadata = toMetadata(
        storageKey,
        {
          contentType: result.blob.contentType ?? "",
          etag: result.blob.etag,
          size: result.blob.size ?? 0,
          uploadedAt: result.blob.uploadedAt,
          url: result.blob.url,
        },
        configuration,
      );
      validateMetadata(contentMetadata);

      if (
        contentMetadata.byteSize !== metadata.byteSize ||
        contentMetadata.etag !== metadata.etag
      ) {
        storageError("STORAGE_OBJECT_INVALID", "The brochure changed while it was being verified.");
      }

      const bytes = await readBytes(result, metadata.byteSize);
      validatePdfBytes(bytes);

      return {
        ...metadata,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    },

    async getPrivateObject(storageKey: string) {
      assertStorageKey(storageKey, configuration);

      let result: GetBlobResult | null;

      try {
        result = await api.get(storageKey, {
          ...(await options()),
          access: "private",
          useCache: false,
        });
      } catch {
        storageError("STORAGE_PROVIDER_FAILURE", "The private brochure store is unavailable.");
      }

      if (!result) {
        return null;
      }

      if (result.statusCode !== 200 || !result.stream) {
        storageError(
          "STORAGE_PROVIDER_FAILURE",
          "The private brochure store did not return object content.",
        );
      }

      const metadata = toMetadata(
        storageKey,
        {
          contentType: result.blob.contentType ?? "",
          etag: result.blob.etag,
          size: result.blob.size ?? 0,
          uploadedAt: result.blob.uploadedAt,
          url: result.blob.url,
        },
        configuration,
      );
      validateMetadata(metadata);

      return { metadata, stream: result.stream };
    },

    async inspectPendingUpload(storageKey: string) {
      const metadata = await getMetadata(storageKey);

      if (!metadata) {
        return { status: "missing" } as const;
      }

      try {
        return {
          status: "valid" as const,
          object: await this.verifyUploadedObject(storageKey),
        };
      } catch (error) {
        if (
          error instanceof SessionBrochureStorageError &&
          error.code === "STORAGE_OBJECT_INVALID"
        ) {
          return { status: "invalid" } as const;
        }

        throw error;
      }
    },

    async deleteObject({ storageKey, etag, retentionSatisfied }) {
      assertStorageKey(storageKey, configuration);

      if (!retentionSatisfied) {
        storageError(
          "STORAGE_RETENTION_NOT_SATISFIED",
          "Brochure retention must be satisfied before deletion is permitted.",
        );
      }

      try {
        await api.del(storageKey, { ...(await options()), ifMatch: etag });
      } catch {
        storageError("STORAGE_PROVIDER_FAILURE", "The private brochure store is unavailable.");
      }
    },
  };
}
