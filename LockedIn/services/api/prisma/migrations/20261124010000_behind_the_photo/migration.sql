CREATE TABLE "TogetherPhoto" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "jpeg" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TogetherPhoto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TogetherPhoto_dimensions_check" CHECK ("width" BETWEEN 1 AND 1400 AND "height" BETWEEN 1 AND 1400),
    CONSTRAINT "TogetherPhoto_bytes_check" CHECK (octet_length("jpeg") BETWEEN 1 AND 786432)
);

CREATE TABLE "TogetherPhotoPin" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "title" VARCHAR(48) NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TogetherPhotoPin_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TogetherPhotoPin_coordinates_check" CHECK ("x" BETWEEN 0 AND 10000 AND "y" BETWEEN 0 AND 10000)
);

CREATE TABLE "TogetherPhotoNote" (
    "id" TEXT NOT NULL,
    "pinId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" VARCHAR(220),
    "voice" BYTEA,
    "voiceDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TogetherPhotoNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TogetherPhotoNote_content_check" CHECK ("text" IS NOT NULL OR "voice" IS NOT NULL),
    CONSTRAINT "TogetherPhotoNote_voice_check" CHECK (
        ("voice" IS NULL AND "voiceDurationMs" IS NULL) OR
        ("voice" IS NOT NULL AND "voiceDurationMs" IS NOT NULL AND "voiceDurationMs" BETWEEN 250 AND 10000
         AND octet_length("voice") BETWEEN 8044 AND 320044)
    )
);

CREATE INDEX "TogetherPhoto_relationshipId_createdAt_id_idx" ON "TogetherPhoto"("relationshipId", "createdAt", "id");
CREATE INDEX "TogetherPhoto_uploaderId_idx" ON "TogetherPhoto"("uploaderId");
CREATE INDEX "TogetherPhotoPin_photoId_createdAt_id_idx" ON "TogetherPhotoPin"("photoId", "createdAt", "id");
CREATE UNIQUE INDEX "TogetherPhotoNote_pinId_authorId_key" ON "TogetherPhotoNote"("pinId", "authorId");
CREATE INDEX "TogetherPhotoNote_authorId_idx" ON "TogetherPhotoNote"("authorId");

ALTER TABLE "TogetherPhoto" ADD CONSTRAINT "TogetherPhoto_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TogetherPhoto" ADD CONSTRAINT "TogetherPhoto_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TogetherPhotoPin" ADD CONSTRAINT "TogetherPhotoPin_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "TogetherPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TogetherPhotoNote" ADD CONSTRAINT "TogetherPhotoNote_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "TogetherPhotoPin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TogetherPhotoNote" ADD CONSTRAINT "TogetherPhotoNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
