ALTER TABLE "DiscoveryReport"
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "evidence" JSONB;
CREATE UNIQUE INDEX "DiscoveryReport_reporterId_requestId_key" ON "DiscoveryReport"("reporterId", "requestId");
ALTER TABLE "DiscoveryModerationAudit" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "DiscoveryModerationAudit_moderatorId_requestId_key" ON "DiscoveryModerationAudit"("moderatorId", "requestId");
