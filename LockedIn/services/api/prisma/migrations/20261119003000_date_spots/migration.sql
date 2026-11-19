ALTER TABLE "DiscoveryMessage" ADD COLUMN "dateSpotPlaceId" TEXT;

CREATE TABLE "DateSpotPreference" (
    "userId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "interests" TEXT[],
    CONSTRAINT "DateSpotPreference_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "DateSpotPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DateSpotRequest" (
    "conversationId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "startsWith" JSONB NOT NULL,
    "joinsWith" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DateSpotRequest_pkey" PRIMARY KEY ("conversationId"),
    CONSTRAINT "DateSpotRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DateSpotRequest_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DateSpotRequest_id_key" ON "DateSpotRequest" ("id");
CREATE INDEX "DateSpotRequest_initiatorId_idx" ON "DateSpotRequest" ("initiatorId");
