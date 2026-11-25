ALTER TABLE "TogetherPhoto"
ADD COLUMN "sourcePlanId" TEXT,
ADD COLUMN "day" DATE;

CREATE UNIQUE INDEX "TogetherPhoto_sourcePlanId_key" ON "TogetherPhoto"("sourcePlanId");

ALTER TABLE "TogetherPhoto" ADD CONSTRAINT "TogetherPhoto_sourcePlanId_fkey"
FOREIGN KEY ("sourcePlanId") REFERENCES "RoadmapPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
