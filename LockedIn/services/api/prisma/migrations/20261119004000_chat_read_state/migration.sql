CREATE TABLE "ChatReadState" (
    "conversationId" TEXT NOT NULL REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "through" BIGINT NOT NULL,
    CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("conversationId", "userId")
);
CREATE INDEX "ChatReadState_userId_idx" ON "ChatReadState"("userId");

ALTER TABLE "DiscoveryMessage" ADD COLUMN "unreadAlertSuppressed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DiscoveryConnection" ADD COLUMN "legacyUnreadBaseline" BIGINT;

-- A legacy-only connection may get its canonical conversation after this
-- migration. Keep its historical cutoff without opening or linking a chat.
UPDATE "DiscoveryConnection" d
SET "legacyUnreadBaseline" = latest.sequence
FROM (
  SELECT m."connectionId", MAX(m.sequence) AS sequence
  FROM "DiscoveryMessage" m
  WHERE m."conversationId" IS NULL AND m."connectionId" IS NOT NULL
  GROUP BY m."connectionId"
) latest
WHERE d.id = latest."connectionId";

-- Old chat had no read receipts. Don't turn the existing transcript into alerts.
INSERT INTO "ChatReadState" ("conversationId", "userId", "through")
SELECT c.id, member.id, latest.sequence
FROM "ChatConversation" c
CROSS JOIN LATERAL (VALUES (c."userLowId"), (c."userHighId")) member(id)
CROSS JOIN LATERAL (
  SELECT m.sequence FROM "DiscoveryMessage" m
  WHERE m."conversationId" = c.id
  ORDER BY m.sequence DESC LIMIT 1
) latest;
