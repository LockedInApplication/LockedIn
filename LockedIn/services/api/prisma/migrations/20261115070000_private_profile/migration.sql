ALTER TABLE "user"
  ADD COLUMN "avatarPreset" TEXT NOT NULL DEFAULT 'initials',
  ADD COLUMN "activityEmails" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppActivity" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Notification" ADD COLUMN "suppressed" BOOLEAN NOT NULL DEFAULT false;
