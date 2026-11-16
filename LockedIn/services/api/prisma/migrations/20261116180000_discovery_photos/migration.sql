CREATE TYPE "DiscoveryPhotoState" AS ENUM ('PROCESSING','APPROVED','NEEDS_REVIEW','REJECTED','CHECK_FAILED');
CREATE TYPE "DiscoveryPhotoJobKind" AS ENUM ('RECONCILE','DESTROY');
CREATE UNIQUE INDEX "DiscoveryProfile_id_ownerId_key" ON "DiscoveryProfile"("id","ownerId");
CREATE TABLE "DiscoveryPhoto" (
  "id" TEXT NOT NULL PRIMARY KEY, "ownerId" TEXT NOT NULL, "profileId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL, "payloadHash" TEXT NOT NULL,
  "state" "DiscoveryPhotoState" NOT NULL DEFAULT 'PROCESSING', "decisionRevision" INTEGER NOT NULL DEFAULT 1,
  "assetId" TEXT, "publicId" TEXT, "assetVersion" INTEGER, "width" INTEGER, "height" INTEGER,
  "policyVersion" TEXT, "screening" JSONB, "scanCompleted" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL DEFAULT 'Checking photo', "expectedRevision" INTEGER NOT NULL DEFAULT 0,
  "replacePhotoId" TEXT, "appealedRevision" INTEGER,
  "deletedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "destroyedAt" TIMESTAMP(3), "retentionUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryPhoto_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DiscoveryPhoto_profileId_ownerId_fkey" FOREIGN KEY ("profileId","ownerId") REFERENCES "DiscoveryProfile"("id","ownerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DiscoveryPhoto_revision_check" CHECK ("decisionRevision">0 AND "expectedRevision">=0),
  CONSTRAINT "DiscoveryPhoto_payload_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "DiscoveryPhoto_dimensions_check" CHECK (("width" IS NULL AND "height" IS NULL) OR ("width" IS NOT NULL AND "height" IS NOT NULL AND "width">=80 AND "height">=80 AND "width"<=1600 AND "height"<=1600)),
  CONSTRAINT "DiscoveryPhoto_asset_check" CHECK (("assetId" IS NULL AND "assetVersion" IS NULL) OR ("assetId" IS NOT NULL AND "publicId" IS NOT NULL AND "assetVersion" IS NOT NULL AND "assetVersion">0))
);
CREATE UNIQUE INDEX "DiscoveryPhoto_ownerId_requestId_key" ON "DiscoveryPhoto"("ownerId","requestId");
CREATE UNIQUE INDEX "DiscoveryPhoto_publicId_key" ON "DiscoveryPhoto"("publicId");
CREATE INDEX "DiscoveryPhoto_ownerId_state_idx" ON "DiscoveryPhoto"("ownerId","state");
CREATE INDEX "DiscoveryPhoto_state_createdAt_idx" ON "DiscoveryPhoto"("state","createdAt");
CREATE TABLE "DiscoveryPhotoJob" (
  "id" TEXT NOT NULL PRIMARY KEY, "photoId" TEXT NOT NULL, "kind" "DiscoveryPhotoJobKind" NOT NULL,
  "dedupeKey" TEXT NOT NULL, "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT, "failedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryPhotoJob_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "DiscoveryPhoto"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DiscoveryPhotoJob_attempts_check" CHECK ("attempts">=0)
);
CREATE UNIQUE INDEX "DiscoveryPhotoJob_dedupeKey_key" ON "DiscoveryPhotoJob"("dedupeKey");
CREATE INDEX "DiscoveryPhotoJob_completedAt_failedAt_dueAt_idx" ON "DiscoveryPhotoJob"("completedAt","failedAt","dueAt");
CREATE TABLE "DiscoveryPhotoAudit" (
  "id" TEXT NOT NULL PRIMARY KEY, "photoId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "requestId" TEXT NOT NULL, "decisionRevision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscoveryPhotoAudit_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "DiscoveryPhoto"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DiscoveryPhotoAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DiscoveryPhotoAudit_revision_check" CHECK ("decisionRevision">0)
);
CREATE UNIQUE INDEX "DiscoveryPhotoAudit_actorId_requestId_key" ON "DiscoveryPhotoAudit"("actorId","requestId");
CREATE INDEX "DiscoveryPhotoAudit_photoId_createdAt_idx" ON "DiscoveryPhotoAudit"("photoId","createdAt");
ALTER TABLE "DiscoveryReport" ADD COLUMN "photoId" TEXT, ADD COLUMN "photoVersion" INTEGER;
ALTER TABLE "DiscoveryReport" ADD CONSTRAINT "DiscoveryReport_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "DiscoveryPhoto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
