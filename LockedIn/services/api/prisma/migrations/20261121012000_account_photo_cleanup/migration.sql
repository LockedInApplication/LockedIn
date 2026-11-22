CREATE TYPE "AccountDeletionState" AS ENUM ('MANUAL_REQUEST', 'CLEANING_PHOTOS', 'CLEANUP_NEEDS_REVIEW');

ALTER TABLE "AccountDeletionRequest"
    ADD COLUMN "state" "AccountDeletionState" NOT NULL DEFAULT 'MANUAL_REQUEST',
    ADD COLUMN "lastCleanupCheckAt" TIMESTAMP(3);

CREATE INDEX "AccountDeletionRequest_cleanup_queue_idx" ON "AccountDeletionRequest"("state", "lastCleanupCheckAt", "requestedAt");
