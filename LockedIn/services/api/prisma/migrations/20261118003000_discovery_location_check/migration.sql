CREATE TABLE "DiscoveryLocationCheck" (
    "profileId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscoveryLocationCheck_pkey" PRIMARY KEY ("profileId"),
    CONSTRAINT "DiscoveryLocationCheck_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DiscoveryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DiscoveryLocationCheck_areaId_expiresAt_idx" ON "DiscoveryLocationCheck"("areaId", "expiresAt");
