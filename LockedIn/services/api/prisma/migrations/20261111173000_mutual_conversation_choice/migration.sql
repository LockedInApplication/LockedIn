CREATE TABLE "ConversationChoice" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationChoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationChoice_relationshipId_userId_key"
ON "ConversationChoice"("relationshipId", "userId");

CREATE INDEX "ConversationChoice_relationshipId_idx"
ON "ConversationChoice"("relationshipId");

CREATE INDEX "ConversationChoice_userId_idx"
ON "ConversationChoice"("userId");

ALTER TABLE "ConversationChoice"
ADD CONSTRAINT "ConversationChoice_relationshipId_fkey"
FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationChoice"
ADD CONSTRAINT "ConversationChoice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
