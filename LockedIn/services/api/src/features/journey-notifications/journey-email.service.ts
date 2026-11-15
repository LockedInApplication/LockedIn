import type { FastifyRequest } from "fastify";
import { sendJourneyNotificationEmail } from "../../lib/email.js";

export async function sendJourneyEmailSafely(
  request: FastifyRequest,
  params: Parameters<typeof sendJourneyNotificationEmail>[0],
) {
  try {
    await sendJourneyNotificationEmail(params);
  } catch (error) {
    request.log.warn({ error }, "Journey notification email could not be sent");
  }
}
