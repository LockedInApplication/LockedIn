-- Additive, sender-scoped attempt identity. Older historical attempts remain unchanged.
ALTER TABLE "DiscoveryConnection" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "DiscoveryConnection_inviterId_requestId_key" ON "DiscoveryConnection"("inviterId", "requestId");
