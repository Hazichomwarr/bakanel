-- CreateEnum
CREATE TYPE "BrochureStorageProvider" AS ENUM ('VERCEL_BLOB');

-- CreateEnum
CREATE TYPE "TrainingSessionBrochureState" AS ENUM ('PENDING', 'ACTIVE', 'SUPERSEDED', 'REMOVED');

-- CreateTable
CREATE TABLE "TrainingSessionBrochure" (
    "id" UUID NOT NULL,
    "trainingSessionId" UUID NOT NULL,
    "storageProvider" "BrochureStorageProvider" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "state" "TrainingSessionBrochureState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "storageDeletedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingSessionBrochure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSessionBrochure_storageKey_key" ON "TrainingSessionBrochure"("storageKey");

-- At most one active brochure may be associated with a session. Historical versions remain.
CREATE UNIQUE INDEX "TrainingSessionBrochure_one_active_per_session_key"
ON "TrainingSessionBrochure"("trainingSessionId")
WHERE "state" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "TrainingSessionBrochure_trainingSessionId_state_createdAt_idx"
ON "TrainingSessionBrochure"("trainingSessionId", "state", "createdAt");

-- AddForeignKey
ALTER TABLE "TrainingSessionBrochure"
ADD CONSTRAINT "TrainingSessionBrochure_trainingSessionId_fkey"
FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
