export const expertErrorCodes = [
  "EXPERT_NOT_FOUND",
  "INVALID_EXPERT",
  "INVALID_EXPERT_TRANSITION",
  "INVALID_EXPERT_TRANSLATION",
  "EXPERT_TRANSLATION_NOT_FOUND",
  "STALE_EXPERT_STATE",
] as const;

export type ExpertErrorCode = (typeof expertErrorCodes)[number];

export class ExpertDomainError extends Error {
  constructor(readonly code: ExpertErrorCode, message: string) {
    super(message);
    this.name = "ExpertDomainError";
  }
}
