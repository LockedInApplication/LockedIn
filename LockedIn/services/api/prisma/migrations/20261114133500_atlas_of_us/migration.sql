CREATE TYPE "MeaningChapterStatus" AS ENUM ('COLLECTING', 'DISCOVERING', 'CHECKING', 'PROPOSED', 'SHARED');
CREATE TYPE "MeaningCheckStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ALMOST', 'MISSING');

CREATE TABLE "MeaningChapter" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "wordKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "MeaningChapterStatus" NOT NULL DEFAULT 'COLLECTING',
    "sharedDefinition" TEXT,
    "sharedDefinitionProposedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeaningChapter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeaningResponse" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "notMeaning" TEXT NOT NULL,
    "heardSummary" TEXT,
    "heardStatus" "MeaningCheckStatus",
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeaningResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeaningChapter_relationshipId_wordKey_createdAt_idx" ON "MeaningChapter"("relationshipId", "wordKey", "createdAt");
CREATE INDEX "MeaningChapter_createdById_idx" ON "MeaningChapter"("createdById");
CREATE UNIQUE INDEX "MeaningResponse_chapterId_userId_key" ON "MeaningResponse"("chapterId", "userId");
CREATE INDEX "MeaningResponse_userId_idx" ON "MeaningResponse"("userId");

ALTER TABLE "MeaningChapter" ADD CONSTRAINT "MeaningChapter_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeaningChapter" ADD CONSTRAINT "MeaningChapter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeaningChapter" ADD CONSTRAINT "MeaningChapter_sharedDefinitionProposedById_fkey" FOREIGN KEY ("sharedDefinitionProposedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeaningResponse" ADD CONSTRAINT "MeaningResponse_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "MeaningChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeaningResponse" ADD CONSTRAINT "MeaningResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
