export const catalogueErrorCodes = [
  "DOMAIN_NOT_FOUND", "TOPIC_NOT_FOUND", "TRAINING_NOT_FOUND", "TRANSLATION_NOT_FOUND",
  "INVALID_CATALOGUE_TRANSITION", "CATALOGUE_ENTITY_ESTABLISHED", "CATALOGUE_ENTITY_HAS_DEPENDENCIES",
  "INVALID_LOCALE", "INVALID_TRANSLATION", "INVALID_SLUG", "SLUG_CONFLICT", "STALE_CATALOGUE_STATE",
] as const;
export type CatalogueErrorCode = (typeof catalogueErrorCodes)[number];
export class CatalogueDomainError extends Error {
  constructor(readonly code: CatalogueErrorCode, message: string) { super(message); this.name = "CatalogueDomainError"; }
}
