-- Expand only: old writers may continue inserting connection-linked messages.
CREATE TYPE "ChatOrigin" AS ENUM ('DISCOVERY', 'DIRECT_INVITATION', 'LEGACY_RELATIONSHIP');
CREATE TYPE "ChatAccessMode" AS ENUM ('DISCOVERY', 'RELATIONSHIP');
CREATE TABLE "ChatConversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userLowId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userHighId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "origin" "ChatOrigin" NOT NULL,
  "accessMode" "ChatAccessMode" NOT NULL,
  "discoveryConnectionId" TEXT REFERENCES "DiscoveryConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "relationshipId" TEXT REFERENCES "Relationship"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "directInvitationId" TEXT REFERENCES "RelationshipInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "closedAt" TIMESTAMP(3), "closureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatConversation_ordered_pair" CHECK ("userLowId" < "userHighId")
);
CREATE UNIQUE INDEX "ChatConversation_discoveryConnectionId_key" ON "ChatConversation"("discoveryConnectionId");
CREATE UNIQUE INDEX "ChatConversation_relationshipId_key" ON "ChatConversation"("relationshipId");
CREATE UNIQUE INDEX "ChatConversation_directInvitationId_key" ON "ChatConversation"("directInvitationId");
CREATE INDEX "ChatConversation_userLowId_idx" ON "ChatConversation"("userLowId");
CREATE INDEX "ChatConversation_userHighId_idx" ON "ChatConversation"("userHighId");
ALTER TABLE "DiscoveryMessage" ALTER COLUMN "connectionId" DROP NOT NULL;
ALTER TABLE "DiscoveryMessage" ADD COLUMN "conversationId" TEXT REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "DiscoveryMessage_conversationId_senderId_requestId_key" ON "DiscoveryMessage"("conversationId", "senderId", "requestId");
CREATE INDEX "DiscoveryMessage_conversationId_sequence_idx" ON "DiscoveryMessage"("conversationId", "sequence");
ALTER TABLE "DiscoveryReport" ADD COLUMN "conversationId" TEXT REFERENCES "ChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DiscoveryReport_conversationId_idx" ON "DiscoveryReport"("conversationId");
