ALTER TABLE "IntentionSession"
ADD COLUMN "packKey" TEXT NOT NULL DEFAULT 'direction';

ALTER TABLE "IntentionResponse"
ADD COLUMN "contextNotes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "contextShareKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
