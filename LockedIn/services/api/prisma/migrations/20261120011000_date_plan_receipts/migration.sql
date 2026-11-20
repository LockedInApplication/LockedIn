-- Keep the old watermark authoritative for old mixed-client acknowledgements.
-- Text-only receipts must not advance it, including during a rolling upgrade.
CREATE TABLE "ChatTextReadState" (
  "conversationId" TEXT NOT NULL REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "through" BIGINT NOT NULL,
  PRIMARY KEY ("conversationId", "userId")
);
CREATE INDEX "ChatTextReadState_userId_idx" ON "ChatTextReadState"("userId");

CREATE TABLE "ChatDatePlanRead" (
  "planId" TEXT NOT NULL REFERENCES "ChatDatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "through" BIGINT NOT NULL,
  PRIMARY KEY ("planId", "userId")
);
CREATE INDEX "ChatDatePlanRead_userId_idx" ON "ChatDatePlanRead"("userId");

CREATE INDEX "DiscoveryMessage_datePlanEvent_planId_sequence_idx"
  ON "DiscoveryMessage" (("datePlanEvent"->>'id'), "sequence")
  WHERE "datePlanEvent" IS NOT NULL;
