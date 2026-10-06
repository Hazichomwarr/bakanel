export const articleErrorCodes = ["ARTICLE_NOT_FOUND", "INVALID_ARTICLE", "INVALID_ARTICLE_TRANSITION", "ARTICLE_ESTABLISHED", "ARTICLE_TRANSLATION_NOT_FOUND", "INVALID_ARTICLE_TRANSLATION", "ARTICLE_SLUG_CONFLICT", "STALE_ARTICLE_STATE"] as const;
export type ArticleErrorCode = (typeof articleErrorCodes)[number];
export class ArticleDomainError extends Error { constructor(readonly code: ArticleErrorCode, message: string) { super(message); this.name = "ArticleDomainError"; } }
