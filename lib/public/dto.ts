import type { DeliveryMode, PricingMode } from "@prisma/client";

export type PublicTrainingDto = {
  slug: string;
  title: string;
  summary: string | null;
};

export type PublicTrainingDomainDto = {
  name: string;
  slug: string;
};

export type PublicTrainingTopicDto = {
  name: string;
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
