-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('FR', 'EN', 'PT');

-- CreateEnum
CREATE TYPE "CatalogueStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FIXED', 'ON_REQUEST');

-- CreateEnum
CREATE TYPE "ExpertStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EngagementType" AS ENUM ('TRAINING', 'CONSULTING', 'STUDY', 'AUDIT', 'ISO_SUPPORT');

-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EngagementVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "TrainingDomain" (
    "id" UUID NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'DRAFT',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingDomainTranslation" (
    "id" UUID NOT NULL,
    "trainingDomainId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingDomainTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingTopic" (
    "id" UUID NOT NULL,
    "trainingDomainId" UUID NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'DRAFT',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingTopicTranslation" (
    "id" UUID NOT NULL,
    "trainingTopicId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingTopicTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Training" (
    "id" UUID NOT NULL,
    "trainingTopicId" UUID NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingTranslation" (
    "id" UUID NOT NULL,
    "trainingId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "objectives" TEXT,
    "targetAudience" TEXT,
    "program" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" UUID NOT NULL,
    "trainingId" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "registrationDeadline" DATE,
    "deliveryMode" "DeliveryMode" NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "venue" TEXT,
    "pricingMode" "PricingMode" NOT NULL,
    "price" DECIMAL(18,2),
    "currency" VARCHAR(3),
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSessionExpert" (
    "id" UUID NOT NULL,
    "trainingSessionId" UUID NOT NULL,
    "expertId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSessionExpert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expert" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ExpertStatus" NOT NULL DEFAULT 'ACTIVE',
    "portraitReference" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertTranslation" (
    "id" UUID NOT NULL,
    "expertId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "professionalTitle" TEXT,
    "specialization" TEXT,
    "biography" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientOrganization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "logoReference" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientEngagement" (
    "id" UUID NOT NULL,
    "clientOrganizationId" UUID NOT NULL,
    "type" "EngagementType" NOT NULL,
    "status" "EngagementStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "EngagementVisibility" NOT NULL DEFAULT 'PRIVATE',
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientEngagementTranslation" (
    "id" UUID NOT NULL,
    "clientEngagementId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEngagementTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" UUID NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "coverReference" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTranslation" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingDomain_status_displayOrder_idx" ON "TrainingDomain"("status", "displayOrder");

-- CreateIndex
CREATE INDEX "TrainingDomainTranslation_locale_isPublished_idx" ON "TrainingDomainTranslation"("locale", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingDomainTranslation_trainingDomainId_locale_key" ON "TrainingDomainTranslation"("trainingDomainId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingDomainTranslation_locale_slug_key" ON "TrainingDomainTranslation"("locale", "slug");

-- CreateIndex
CREATE INDEX "TrainingTopic_trainingDomainId_status_displayOrder_idx" ON "TrainingTopic"("trainingDomainId", "status", "displayOrder");

-- CreateIndex
CREATE INDEX "TrainingTopicTranslation_locale_isPublished_idx" ON "TrainingTopicTranslation"("locale", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTopicTranslation_trainingTopicId_locale_key" ON "TrainingTopicTranslation"("trainingTopicId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTopicTranslation_locale_slug_key" ON "TrainingTopicTranslation"("locale", "slug");

-- CreateIndex
CREATE INDEX "Training_trainingTopicId_status_idx" ON "Training"("trainingTopicId", "status");

-- CreateIndex
CREATE INDEX "TrainingTranslation_locale_isPublished_idx" ON "TrainingTranslation"("locale", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTranslation_trainingId_locale_key" ON "TrainingTranslation"("trainingId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTranslation_locale_slug_key" ON "TrainingTranslation"("locale", "slug");

-- CreateIndex
CREATE INDEX "TrainingSession_trainingId_status_startDate_idx" ON "TrainingSession"("trainingId", "status", "startDate");

-- CreateIndex
CREATE INDEX "TrainingSessionExpert_expertId_idx" ON "TrainingSessionExpert"("expertId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSessionExpert_trainingSessionId_expertId_key" ON "TrainingSessionExpert"("trainingSessionId", "expertId");

-- CreateIndex
CREATE INDEX "Expert_status_displayOrder_idx" ON "Expert"("status", "displayOrder");

-- CreateIndex
CREATE INDEX "ExpertTranslation_locale_isPublished_idx" ON "ExpertTranslation"("locale", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertTranslation_expertId_locale_key" ON "ExpertTranslation"("expertId", "locale");

-- CreateIndex
CREATE INDEX "ClientOrganization_isActive_idx" ON "ClientOrganization"("isActive");

-- CreateIndex
CREATE INDEX "ClientEngagement_clientOrganizationId_status_visibility_idx" ON "ClientEngagement"("clientOrganizationId", "status", "visibility");

-- CreateIndex
CREATE INDEX "ClientEngagementTranslation_locale_isPublished_idx" ON "ClientEngagementTranslation"("locale", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "ClientEngagementTranslation_clientEngagementId_locale_key" ON "ClientEngagementTranslation"("clientEngagementId", "locale");

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "ArticleTranslation_locale_isPublished_idx" ON "ArticleTranslation"("locale", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTranslation_articleId_locale_key" ON "ArticleTranslation"("articleId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTranslation_locale_slug_key" ON "ArticleTranslation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- AddForeignKey
ALTER TABLE "TrainingDomainTranslation" ADD CONSTRAINT "TrainingDomainTranslation_trainingDomainId_fkey" FOREIGN KEY ("trainingDomainId") REFERENCES "TrainingDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTopic" ADD CONSTRAINT "TrainingTopic_trainingDomainId_fkey" FOREIGN KEY ("trainingDomainId") REFERENCES "TrainingDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTopicTranslation" ADD CONSTRAINT "TrainingTopicTranslation_trainingTopicId_fkey" FOREIGN KEY ("trainingTopicId") REFERENCES "TrainingTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_trainingTopicId_fkey" FOREIGN KEY ("trainingTopicId") REFERENCES "TrainingTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTranslation" ADD CONSTRAINT "TrainingTranslation_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSessionExpert" ADD CONSTRAINT "TrainingSessionExpert_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSessionExpert" ADD CONSTRAINT "TrainingSessionExpert_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertTranslation" ADD CONSTRAINT "ExpertTranslation_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientEngagement" ADD CONSTRAINT "ClientEngagement_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "ClientOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientEngagementTranslation" ADD CONSTRAINT "ClientEngagementTranslation_clientEngagementId_fkey" FOREIGN KEY ("clientEngagementId") REFERENCES "ClientEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTranslation" ADD CONSTRAINT "ArticleTranslation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
