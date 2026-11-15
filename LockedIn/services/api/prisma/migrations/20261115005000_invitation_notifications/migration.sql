ALTER TABLE "Notification" ALTER COLUMN "relationshipId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "invitationId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "RelationshipInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_exactly_one_source"
  CHECK (("relationshipId" IS NOT NULL AND "invitationId" IS NULL)
      OR ("relationshipId" IS NULL AND "invitationId" IS NOT NULL));
CREATE INDEX "Notification_invitationId_idx" ON "Notification"("invitationId");
