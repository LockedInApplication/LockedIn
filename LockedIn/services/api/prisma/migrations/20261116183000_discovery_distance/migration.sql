CREATE TABLE "DiscoveryDistancePreference" (
    "profileId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
    "longitude" DOUBLE PRECISION NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
    "maxDistanceMiles" INTEGER NOT NULL CHECK ("maxDistanceMiles" IN (5, 10, 25, 50)),
    "areaLabel" TEXT,
    "revision" TEXT NOT NULL,
    CONSTRAINT "DiscoveryDistancePreference_pkey" PRIMARY KEY ("profileId"),
    CONSTRAINT "DiscoveryDistancePreference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DiscoveryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DiscoveryDistancePreference_latitude_idx" ON "DiscoveryDistancePreference"("latitude");
