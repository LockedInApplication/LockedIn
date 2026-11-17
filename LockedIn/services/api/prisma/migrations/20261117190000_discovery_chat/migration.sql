CREATE TABLE "DiscoveryMessage" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "connectionId" TEXT NOT NULL REFERENCES "DiscoveryConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "senderId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "requestId" TEXT NOT NULL,
    "text" TEXT NOT NULL CHECK (char_length("text") BETWEEN 1 AND 2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscoveryMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscoveryMessage_sequence_key" ON "DiscoveryMessage"("sequence");
CREATE UNIQUE INDEX "DiscoveryMessage_connectionId_senderId_requestId_key" ON "DiscoveryMessage"("connectionId", "senderId", "requestId");
CREATE INDEX "DiscoveryMessage_connectionId_sequence_idx" ON "DiscoveryMessage"("connectionId", "sequence");
CREATE INDEX "DiscoveryMessage_senderId_idx" ON "DiscoveryMessage"("senderId");
