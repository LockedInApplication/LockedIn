CREATE TYPE "TogetherEnvelopeTone" AS ENUM ('CLAY', 'OLIVE', 'LINEN', 'SLATE');

CREATE TABLE "TogetherEnvelope" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "title" VARCHAR(65) NOT NULL,
    "day" DATE,
    "tone" "TogetherEnvelopeTone" NOT NULL,
    "coverPhotoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TogetherEnvelope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TogetherEnvelopeCaption" (
    "envelopeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" VARCHAR(160) NOT NULL,
    CONSTRAINT "TogetherEnvelopeCaption_pkey" PRIMARY KEY ("envelopeId", "authorId")
);

ALTER TABLE "TogetherPhoto" ADD COLUMN "envelopeId" TEXT;

CREATE UNIQUE INDEX "TogetherEnvelope_coverPhotoId_key" ON "TogetherEnvelope"("coverPhotoId");
CREATE INDEX "TogetherEnvelope_relationshipId_createdAt_id_idx" ON "TogetherEnvelope"("relationshipId", "createdAt", "id");
CREATE INDEX "TogetherEnvelopeCaption_authorId_idx" ON "TogetherEnvelopeCaption"("authorId");
CREATE INDEX "TogetherPhoto_envelopeId_idx" ON "TogetherPhoto"("envelopeId");

ALTER TABLE "TogetherEnvelope" ADD CONSTRAINT "TogetherEnvelope_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TogetherEnvelope" ADD CONSTRAINT "TogetherEnvelope_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "TogetherPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TogetherEnvelopeCaption" ADD CONSTRAINT "TogetherEnvelopeCaption_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "TogetherEnvelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TogetherEnvelopeCaption" ADD CONSTRAINT "TogetherEnvelopeCaption_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TogetherPhoto" ADD CONSTRAINT "TogetherPhoto_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "TogetherEnvelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;
