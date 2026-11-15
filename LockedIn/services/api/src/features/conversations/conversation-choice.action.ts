import type { FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { sendJourneyEmailSafely } from "../journey-notifications/journey-email.service.js";
import { withNotifications } from "../notifications/index.js";
import { getConversationPack } from "./conversation.catalog.js";
import { chooseConversation } from "./conversation.service.js";

export async function performConversationChoice(
  request: FastifyRequest,
  user: { id: string; name?: string | null },
  relationshipId: string,
  packKey: string | null,
  notificationId?: bigint,
) {
  const result = await withNotifications(relationshipId, user.id, (tx) =>
    chooseConversation(relationshipId, user.id, packKey, tx, notificationId),
  ).catch((error: unknown) => {
    if (
      notificationId !== undefined &&
      error instanceof Error &&
      error.message === "This shared space is no longer available."
    )
      return {
        error:
          "This shared space has ended. The suggestion is no longer available.",
      };
    throw error;
  });
  if ("error" in result) return result;
  const partner = await prisma.relationshipMember.findFirst({
    where: { relationshipId, userId: { not: user.id } },
    include: { user: true },
  });
  if (partner?.user.email)
    await sendJourneyEmailSafely(request, {
      to: partner.user.email,
      name: partner.user.name,
      subject: result.started
        ? "Your next LockedIn conversation is ready"
        : "Your partner made a conversation choice",
      heading: result.started
        ? "You both chose the same conversation."
        : "A conversation choice is waiting for you.",
      message: result.started
        ? "Your private prompts are ready. Each person still controls what is eventually revealed."
        : `${user.name ?? "Your partner"} selected ${packKey === null ? "either conversation" : getConversationPack(packKey).title}. You can accept it, suggest another topic, or choose “Either works for me.”`,
      actionLabel: result.started ? "Begin privately" : "Review the choices",
      url: `${env.APP_URL}/journey`,
    });
  return result;
}
