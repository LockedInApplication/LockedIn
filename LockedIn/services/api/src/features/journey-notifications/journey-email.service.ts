import type { FastifyRequest } from "fastify";
import { sendJourneyNotificationEmail } from "../../lib/email.js";
import { activityEmailAllowed } from "../notifications/notification-preferences.js";

export async function sendJourneyEmailSafely(
  request: FastifyRequest,
  params: Parameters<typeof sendJourneyNotificationEmail>[0],
) {
  try {
    if (!await activityEmailAllowed(params.to)) return;
    await sendJourneyNotificationEmail(params);
  } catch (error) {
    request.log.warn({ error }, "Journey notification email could not be sent");
  }
}
