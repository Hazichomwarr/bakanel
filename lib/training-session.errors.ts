export const trainingSessionErrorCodes = [
  "SESSION_NOT_FOUND",
  "TRAINING_NOT_FOUND",
  "EXPERT_NOT_FOUND",
  "EXPERT_INACTIVE",
  "INVALID_TRANSITION",
  "SESSION_IMMUTABLE",
  "STALE_SESSION_STATE",
  "INVALID_DATE_RANGE",
  "INVALID_REGISTRATION_DEADLINE",
  "INVALID_PRICING",
  "INVALID_CURRENCY",
  "INVALID_LOCATION",
  "INVALID_COUNTRY",
  "INVALID_CAPACITY",
  "EXPERT_ALREADY_ASSIGNED",
  "EXPERT_NOT_ASSIGNED",
] as const;

export type TrainingSessionErrorCode = (typeof trainingSessionErrorCodes)[number];

export class TrainingSessionDomainError extends Error {
  constructor(
    readonly code: TrainingSessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TrainingSessionDomainError";
  }
}
