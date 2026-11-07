CREATE TYPE "BrochureUploadAttemptKind" AS ENUM ('ISSUE', 'FINALIZE');

CREATE TABLE "TrainingSessionBrochureUploadAuthorization" (
  "id" UUID NOT NULL,
  "adminUserId" UUID NOT NULL,
  "trainingSessionId" UUID NOT NULL,
  "pendingBrochureId" UUID NOT NULL,
  "expectedActiveBrochureId" UUID,
  "secretHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "TrainingSessionBrochureUploadAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrochureUploadAttempt" (
  "adminUserId" UUID NOT NULL,
  "kind" "BrochureUploadAttemptKind" NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BrochureUploadAttempt_pkey" PRIMARY KEY ("adminUserId", "kind", "windowStart")
);

CREATE UNIQUE INDEX "TrainingSessionBrochureUploadAuthorization_pendingBrochureId_key" ON "TrainingSessionBrochureUploadAuthorization"("pendingBrochureId");
CREATE UNIQUE INDEX "TrainingSessionBrochureUploadAuthorization_secretHash_key" ON "TrainingSessionBrochureUploadAuthorization"("secretHash");
CREATE INDEX "TrainingSessionBrochureUploadAuthorization_adminUserId_createdAt_idx" ON "TrainingSessionBrochureUploadAuthorization"("adminUserId", "createdAt");
CREATE INDEX "TrainingSessionBrochureUploadAuthorization_trainingSessionId_expiresAt_idx" ON "TrainingSessionBrochureUploadAuthorization"("trainingSessionId", "expiresAt");
CREATE INDEX "TrainingSessionBrochureUploadAuthorization_expiresAt_consumedAt_idx" ON "TrainingSessionBrochureUploadAuthorization"("expiresAt", "consumedAt");
CREATE INDEX "BrochureUploadAttempt_windowStart_idx" ON "BrochureUploadAttempt"("windowStart");

ALTER TABLE "TrainingSessionBrochureUploadAuthorization" ADD CONSTRAINT "BrochureUploadAuthorization_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingSessionBrochureUploadAuthorization" ADD CONSTRAINT "BrochureUploadAuthorization_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingSessionBrochureUploadAuthorization" ADD CONSTRAINT "BrochureUploadAuthorization_pendingBrochureId_fkey" FOREIGN KEY ("pendingBrochureId") REFERENCES "TrainingSessionBrochure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrochureUploadAttempt" ADD CONSTRAINT "BrochureUploadAttempt_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
