CREATE TABLE "TogetherHomeNote" (
    "relationshipId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" VARCHAR(280) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TogetherHomeNote_pkey" PRIMARY KEY ("relationshipId", "authorId")
);

CREATE INDEX "TogetherHomeNote_authorId_idx" ON "TogetherHomeNote"("authorId");

ALTER TABLE "TogetherHomeNote" ADD CONSTRAINT "TogetherHomeNote_relationshipId_fkey"
    FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TogetherHomeNote" ADD CONSTRAINT "TogetherHomeNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
