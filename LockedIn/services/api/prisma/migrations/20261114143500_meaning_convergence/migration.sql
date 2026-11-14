ALTER TYPE "MeaningChapterStatus" ADD VALUE 'PROPOSING';
ALTER TYPE "MeaningChapterStatus" ADD VALUE 'CHOOSING';
ALTER TYPE "MeaningChapterStatus" ADD VALUE 'RESOLVING';

CREATE TYPE "MeaningProposalKind" AS ENUM ('PERSONAL', 'BLEND', 'REVISION', 'PAIRED');
CREATE TYPE "MeaningSelectionMode" AS ENUM ('PROPOSAL', 'BLEND', 'KEEP_BOTH');

ALTER TABLE "MeaningChapter"
ADD COLUMN "candidateVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "MeaningDefinitionProposal" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "MeaningProposalKind" NOT NULL,
    "definition" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeaningDefinitionProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeaningSelection" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "MeaningSelectionMode" NOT NULL,
    "proposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeaningSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeaningFinalApproval" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "candidateVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeaningFinalApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeaningDefinitionProposal_chapterId_kind_createdAt_idx" ON "MeaningDefinitionProposal"("chapterId", "kind", "createdAt");
CREATE INDEX "MeaningDefinitionProposal_userId_idx" ON "MeaningDefinitionProposal"("userId");
CREATE UNIQUE INDEX "MeaningSelection_chapterId_userId_key" ON "MeaningSelection"("chapterId", "userId");
CREATE INDEX "MeaningSelection_proposalId_idx" ON "MeaningSelection"("proposalId");
CREATE UNIQUE INDEX "MeaningFinalApproval_chapterId_userId_candidateVersion_key" ON "MeaningFinalApproval"("chapterId", "userId", "candidateVersion");
CREATE INDEX "MeaningFinalApproval_chapterId_candidateVersion_idx" ON "MeaningFinalApproval"("chapterId", "candidateVersion");

ALTER TABLE "MeaningDefinitionProposal" ADD CONSTRAINT "MeaningDefinitionProposal_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "MeaningChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeaningDefinitionProposal" ADD CONSTRAINT "MeaningDefinitionProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeaningSelection" ADD CONSTRAINT "MeaningSelection_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "MeaningChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeaningSelection" ADD CONSTRAINT "MeaningSelection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeaningSelection" ADD CONSTRAINT "MeaningSelection_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MeaningDefinitionProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeaningFinalApproval" ADD CONSTRAINT "MeaningFinalApproval_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "MeaningChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeaningFinalApproval" ADD CONSTRAINT "MeaningFinalApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
