-- Preserve the existing exactly-one-source guarantee while admitting discovery.
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_exactly_one_source";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_exactly_one_source"
  CHECK (num_nonnulls("relationshipId", "invitationId", "discoveryConnectionId") = 1);
