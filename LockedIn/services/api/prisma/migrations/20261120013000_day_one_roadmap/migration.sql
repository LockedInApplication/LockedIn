CREATE TYPE "RoadmapPlanStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PASSED', 'WITHDRAWN', 'DONE', 'CANCELED');

CREATE TABLE "RoadmapPlan" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "resolvedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "RoadmapPlanStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "day" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoadmapPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoadmapPlan_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoadmapPlan_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoadmapPlan_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "RoadmapPlanRequest" (
    "key" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    CONSTRAINT "RoadmapPlanRequest_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "RoadmapPlanRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RoadmapPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RoadmapPlan_relationshipId_updatedAt_id_idx" ON "RoadmapPlan"("relationshipId", "updatedAt", "id");
CREATE INDEX "RoadmapPlan_proposerId_idx" ON "RoadmapPlan"("proposerId");
CREATE INDEX "RoadmapPlan_resolvedById_idx" ON "RoadmapPlan"("resolvedById");
CREATE INDEX "RoadmapPlanRequest_planId_idx" ON "RoadmapPlanRequest"("planId");
