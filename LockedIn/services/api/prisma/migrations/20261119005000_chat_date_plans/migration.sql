CREATE TYPE "ChatDatePlanStatus" AS ENUM ('pending', 'confirmed', 'declined', 'withdrawn', 'canceled');

ALTER TABLE "DiscoveryMessage" ADD COLUMN "datePlanEvent" JSONB;

CREATE TABLE "ChatDatePlan" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "venueName" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "proposerId" TEXT NOT NULL,
    "state" "ChatDatePlanStatus" NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatDatePlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChatDatePlan_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatDatePlan_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "DiscoveryMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatDatePlan_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ChatDatePlan_conversationId_state_startsAt_idx" ON "ChatDatePlan"("conversationId", "state", "startsAt");
CREATE INDEX "ChatDatePlan_sourceMessageId_idx" ON "ChatDatePlan"("sourceMessageId");
CREATE INDEX "ChatDatePlan_proposerId_idx" ON "ChatDatePlan"("proposerId");
