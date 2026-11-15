ALTER TABLE "RelationshipInvite" ADD COLUMN "declinedAt" TIMESTAMP(3), ADD COLUMN "withdrawnAt" TIMESTAMP(3);
-- Preserve the effective decline time for invitations handled before this feature.
UPDATE "RelationshipInvite" SET "declinedAt"="updatedAt" WHERE "status"='DECLINED';
UPDATE "RelationshipInvite" SET "withdrawnAt"="updatedAt" WHERE "status"='CANCELED';
CREATE INDEX "RelationshipInvite_inviterId_inviteeId_declinedAt_idx" ON "RelationshipInvite"("inviterId","inviteeId","declinedAt");
CREATE TABLE "InvitationBlock" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvitationBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvitationBlock_no_self" CHECK ("blockerId"<>"blockedId"),
  CONSTRAINT "InvitationBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InvitationBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InvitationBlock_blockerId_blockedId_key" ON "InvitationBlock"("blockerId","blockedId");
CREATE INDEX "InvitationBlock_blockedId_idx" ON "InvitationBlock"("blockedId");
