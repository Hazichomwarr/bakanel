export const sessionBrochureStorageErrorCodes = [
  "STORAGE_CONFIGURATION_INVALID",
  "STORAGE_OBJECT_NOT_FOUND",
  "STORAGE_OBJECT_INVALID",
  "STORAGE_PROVIDER_FAILURE",
  "STORAGE_RETENTION_NOT_SATISFIED",
  "BROCHURE_VERIFICATION_MISMATCH",
] as const;

export type SessionBrochureStorageErrorCode = (typeof sessionBrochureStorageErrorCodes)[number];

export class SessionBrochureStorageError extends Error {
  constructor(
    readonly code: SessionBrochureStorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SessionBrochureStorageError";
  }
}
