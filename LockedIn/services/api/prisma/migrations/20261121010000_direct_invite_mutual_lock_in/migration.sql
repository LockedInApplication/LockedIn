ALTER TYPE "ChatAccessMode" ADD VALUE 'DIRECT_INVITATION';

ALTER TABLE "Relationship" ADD COLUMN "directLockedInAt" TIMESTAMP(3);

ALTER TABLE "ChatConversation"
  ADD COLUMN "lockInRequestedBy" TEXT,
  ADD COLUMN "lockInRequestId" TEXT,
  ADD CONSTRAINT "ChatConversation_lockInRequest_consistent" CHECK (
    ("lockInRequestId" IS NULL AND "lockInRequestedBy" IS NULL)
    OR ("lockInRequestId" IS NOT NULL AND "lockInRequestedBy" IS NOT NULL
      AND "lockInRequestedBy" IN ("userLowId", "userHighId"))
  );

ALTER TABLE "Notification" ADD COLUMN "conversationId" TEXT
  REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_exactly_one_source";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_exactly_one_source"
  CHECK (num_nonnulls("relationshipId", "invitationId", "discoveryConnectionId", "conversationId") = 1);
CREATE INDEX "Notification_conversationId_idx" ON "Notification"("conversationId");
