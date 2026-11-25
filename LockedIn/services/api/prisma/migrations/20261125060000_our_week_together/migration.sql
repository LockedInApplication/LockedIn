-- Only future "Mark discussed" actions have a known discussion date.
-- A topic's last edit or shelf change isn't evidence that it was discussed then.
ALTER TABLE "RoomTalkTopic" ADD COLUMN "discussedAt" TIMESTAMP(3);
