export const trainingSessionBrochureErrorCodes = [
  "SESSION_NOT_FOUND",
  "SESSION_IMMUTABLE",
  "BROCHURE_NOT_FOUND",
  "BROCHURE_NOT_PENDING",
  "BROCHURE_NOT_ACTIVE",
  "STALE_BROCHURE_STATE",
  "INVALID_BROCHURE_METADATA",
  "BROCHURE_STORAGE_KEY_CONFLICT",
] as const;

export type TrainingSessionBrochureErrorCode = (typeof trainingSessionBrochureErrorCodes)[number];

export class TrainingSessionBrochureDomainError extends Error {
  constructor(
    readonly code: TrainingSessionBrochureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TrainingSessionBrochureDomainError";
  }
}
