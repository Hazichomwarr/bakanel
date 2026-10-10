import type { DeliveryMode, PricingMode } from "@prisma/client";

import type { PublicLocale } from "./locale-codes";

export type PublicTrainingDomainDto = {
  name: string;
  slug: string;
};

export type PublicTrainingTopicDto = {
  name: string;
  slug: string;
};

/**
 * Programme card. Domain and topic labels come from the requested locale's published
 * translations of the training's eligible ancestors; they are never taken from another locale.
 */
export type PublicTrainingDto = {
  slug: string;
  title: string;
  summary: string | null;
  domain: PublicTrainingDomainDto;
  topic: PublicTrainingTopicDto;
};

/**
 * Programme detail: the card plus optional translated sections. A section is `null` when the
 * requested locale's translation does not provide it, so presentation can omit it.
 */
export type PublicTrainingDetailDto = PublicTrainingDto & {
  description: string | null;
  objectives: string | null;
  targetAudience: string | null;
  program: string | null;
};

/** The same eligible programme's published slug in another public locale. */
export type PublicTrainingAlternateDto = {
  locale: PublicLocale;
  slug: string;
};

export type PublicSessionDto = {
  trainingSlug: string;
  trainingTitle: string;
  startDate: Date;
  endDate: Date;
  deliveryMode: DeliveryMode;
  city: string | null;
  country: string | null;
  venue: string | null;
  pricingMode: PricingMode;
  price: string | null;
  currency: string | null;
  registrationDeadline: Date | null;
  registrationOpen: boolean;
};

export type PublicExpertDto = {
  name: string;
  professionalTitle: string | null;
  specialization: string | null;
  biography: string | null;
  portraitReference: string | null;
};

export type PublicReferenceDto = {
  organizationName: string;
  organizationLogoReference: string | null;
  title: string;
  description: string | null;
};

export type PublicArticleDto = {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  coverReference: string | null;
  publishedAt: Date;
};

/** Article list entry: the detail DTO without the full article body. */
export type PublicArticleSummaryDto = Omit<PublicArticleDto, "content">;
