-- Additive pilot foundation. No existing profile is created or published.
CREATE TYPE "DiscoveryConnectionState" AS ENUM ('PENDING','ACCEPTED','DECLINED','WITHDRAWN','EXPIRED','CLOSED','PROMOTED');
ALTER TABLE "InvitationBlock" ADD COLUMN "safePublicLabel" TEXT;
ALTER TABLE "Notification" ADD COLUMN "discoveryConnectionId" TEXT;

CREATE TABLE "DiscoveryProfile" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "draft" JSONB NOT NULL, "publishedSnapshot" JSONB, "publishedAreaId" TEXT, "publishedIntention" TEXT,
  "publicationVersion" INTEGER NOT NULL DEFAULT 0, "publicationConsentVersion" INTEGER,
  "publicationConsentedAt" TIMESTAMP(3), "adultAttestedAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3), "suspendedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DiscoveryProfile_publishedAreaId_publishedIntention_idx" ON "DiscoveryProfile"("publishedAreaId","publishedIntention");

CREATE TABLE "DiscoveryConnection" (
  "id" TEXT PRIMARY KEY,
  "userLowId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userHighId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "inviterId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "questionKey" TEXT NOT NULL, "questionText" TEXT NOT NULL, "hello" TEXT NOT NULL,
  "senderPublicName" TEXT NOT NULL, "senderAvatarPreset" TEXT NOT NULL,
  "state" "DiscoveryConnectionState" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL, "declinedAt" TIMESTAMP(3), "acceptedAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3),
  "lowReadinessVersion" INTEGER, "highReadinessVersion" INTEGER, "consentVersion" INTEGER NOT NULL DEFAULT 1,
  "relationshipId" TEXT UNIQUE REFERENCES "Relationship"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryConnection_sorted_pair_check" CHECK ("userLowId" < "userHighId"),
  CONSTRAINT "DiscoveryConnection_inviter_participant_check" CHECK ("inviterId" IN ("userLowId","userHighId"))
);
-- Expiry is derived under sorted account locks before a live attempt can be replaced.
CREATE UNIQUE INDEX "DiscoveryConnection_live_pair_key" ON "DiscoveryConnection"("userLowId","userHighId") WHERE "state" IN ('PENDING','ACCEPTED');
CREATE INDEX "DiscoveryConnection_userLowId_state_idx" ON "DiscoveryConnection"("userLowId","state");
CREATE INDEX "DiscoveryConnection_userHighId_state_idx" ON "DiscoveryConnection"("userHighId","state");
CREATE INDEX "DiscoveryConnection_directional_decline_idx" ON "DiscoveryConnection"("inviterId","userLowId","userHighId","declinedAt");

CREATE TABLE "DiscoveryDraft" (
  "id" TEXT PRIMARY KEY, "connectionId" TEXT NOT NULL REFERENCES "DiscoveryConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "ownerId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "text" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryDraft_connectionId_ownerId_key" UNIQUE ("connectionId","ownerId")
);
CREATE INDEX "DiscoveryDraft_ownerId_idx" ON "DiscoveryDraft"("ownerId");
CREATE TABLE "DiscoverySharedResponse" (
  "id" TEXT PRIMARY KEY, "connectionId" TEXT NOT NULL REFERENCES "DiscoveryConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "ownerId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL, "text" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version">0),
  "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscoverySharedResponse_connectionId_ownerId_requestId_key" UNIQUE ("connectionId","ownerId","requestId"),
  CONSTRAINT "DiscoverySharedResponse_connectionId_ownerId_version_key" UNIQUE ("connectionId","ownerId","version")
);
CREATE INDEX "DiscoverySharedResponse_ownerId_idx" ON "DiscoverySharedResponse"("ownerId");
CREATE TABLE "PrivateReflection" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "text" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "DiscoveryReport" (
  "id" TEXT PRIMARY KEY, "reporterId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "reportedUserId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "connectionId" TEXT REFERENCES "DiscoveryConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "reason" TEXT NOT NULL, "details" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3)
);
CREATE INDEX "DiscoveryReport_resolvedAt_createdAt_idx" ON "DiscoveryReport"("resolvedAt","createdAt");
CREATE INDEX "DiscoveryReport_reporterId_idx" ON "DiscoveryReport"("reporterId");
CREATE INDEX "DiscoveryReport_reportedUserId_idx" ON "DiscoveryReport"("reportedUserId");
CREATE TABLE "DiscoveryModerationAudit" (
  "id" TEXT PRIMARY KEY, "moderatorId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "targetUserId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reportId" TEXT REFERENCES "DiscoveryReport"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DiscoveryModerationAudit_targetUserId_createdAt_idx" ON "DiscoveryModerationAudit"("targetUserId","createdAt");
CREATE INDEX "DiscoveryModerationAudit_moderatorId_idx" ON "DiscoveryModerationAudit"("moderatorId");
CREATE TABLE "DiscoveryThrottle" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "action" TEXT NOT NULL, "windowStart" TIMESTAMP(3) NOT NULL, "count" INTEGER NOT NULL DEFAULT 0 CHECK ("count">=0),
  CONSTRAINT "DiscoveryThrottle_userId_action_windowStart_key" UNIQUE ("userId","action","windowStart")
);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_discoveryConnectionId_fkey" FOREIGN KEY ("discoveryConnectionId") REFERENCES "DiscoveryConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Notification_discoveryConnectionId_idx" ON "Notification"("discoveryConnectionId");
