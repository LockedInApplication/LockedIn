CREATE TYPE "RoomTalkStarterShelf" AS ENUM ('MARRIAGE', 'DATE_IDEAS');
CREATE TYPE "RoomTalkPhase" AS ENUM ('SAVED', 'SUGGESTED', 'TALK_NEXT', 'DISCUSSED');
CREATE TYPE "RoomTalkMessageKind" AS ENUM ('REPLY', 'QUESTION');

CREATE TABLE "RoomTalkShelf" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "name" VARCHAR(48) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomTalkShelf_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomTalkTopic" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "shelfId" TEXT,
    "starterShelf" "RoomTalkStarterShelf",
    "question" VARCHAR(200) NOT NULL,
    "phase" "RoomTalkPhase" NOT NULL DEFAULT 'SAVED',
    "suggestedById" TEXT,
    "inPersonById" TEXT,
    "takeaway" VARCHAR(280),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoomTalkTopic_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoomTalkTopic_one_shelf" CHECK ("shelfId" IS NULL OR "starterShelf" IS NULL),
    CONSTRAINT "RoomTalkTopic_in_person_open" CHECK ("inPersonById" IS NULL OR "phase" = 'TALK_NEXT')
);

CREATE TABLE "RoomTalkMessage" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "RoomTalkMessageKind" NOT NULL,
    "body" VARCHAR(420) NOT NULL,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomTalkMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoomTalkMessage_answer_reply" CHECK ("replyToId" IS NULL OR "kind" = 'REPLY')
);

CREATE TABLE "RoomTalkPresence" (
    "topicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoomTalkPresence_pkey" PRIMARY KEY ("topicId", "userId", "viewerId")
);

CREATE INDEX "RoomTalkShelf_relationshipId_createdAt_id_idx" ON "RoomTalkShelf"("relationshipId", "createdAt", "id");
CREATE INDEX "RoomTalkShelf_authorId_idx" ON "RoomTalkShelf"("authorId");
CREATE INDEX "RoomTalkTopic_relationshipId_updatedAt_id_idx" ON "RoomTalkTopic"("relationshipId", "updatedAt", "id");
CREATE INDEX "RoomTalkTopic_authorId_idx" ON "RoomTalkTopic"("authorId");
CREATE INDEX "RoomTalkTopic_shelfId_idx" ON "RoomTalkTopic"("shelfId");
CREATE INDEX "RoomTalkTopic_suggestedById_idx" ON "RoomTalkTopic"("suggestedById");
CREATE INDEX "RoomTalkTopic_inPersonById_idx" ON "RoomTalkTopic"("inPersonById");
CREATE INDEX "RoomTalkMessage_topicId_createdAt_id_idx" ON "RoomTalkMessage"("topicId", "createdAt", "id");
CREATE INDEX "RoomTalkMessage_authorId_idx" ON "RoomTalkMessage"("authorId");
CREATE INDEX "RoomTalkMessage_replyToId_idx" ON "RoomTalkMessage"("replyToId");
CREATE INDEX "RoomTalkPresence_userId_expiresAt_idx" ON "RoomTalkPresence"("userId", "expiresAt");

ALTER TABLE "RoomTalkShelf" ADD CONSTRAINT "RoomTalkShelf_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomTalkShelf" ADD CONSTRAINT "RoomTalkShelf_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomTalkTopic" ADD CONSTRAINT "RoomTalkTopic_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomTalkTopic" ADD CONSTRAINT "RoomTalkTopic_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomTalkTopic" ADD CONSTRAINT "RoomTalkTopic_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "RoomTalkShelf"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoomTalkTopic" ADD CONSTRAINT "RoomTalkTopic_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoomTalkTopic" ADD CONSTRAINT "RoomTalkTopic_inPersonById_fkey" FOREIGN KEY ("inPersonById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoomTalkMessage" ADD CONSTRAINT "RoomTalkMessage_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "RoomTalkTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomTalkMessage" ADD CONSTRAINT "RoomTalkMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomTalkMessage" ADD CONSTRAINT "RoomTalkMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "RoomTalkMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoomTalkPresence" ADD CONSTRAINT "RoomTalkPresence_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "RoomTalkTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomTalkPresence" ADD CONSTRAINT "RoomTalkPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
