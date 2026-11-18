-- Separate explicit lock-in consent from historical build-readiness choices.
ALTER TABLE "DiscoveryConnection"
  ADD COLUMN "lowLockInVersion" INTEGER,
  ADD COLUMN "highLockInVersion" INTEGER,
  ADD COLUMN "lockedInAt" TIMESTAMP(3);
