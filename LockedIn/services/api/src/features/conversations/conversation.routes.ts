import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { isRelationshipMember } from "../relationships/relationship-access.service.js";
import { sendJourneyEmailSafely } from "../journey-notifications/journey-email.service.js";
import { conversationPacks, getConversationPack } from "./conversation.catalog.js";
import { conversationChoiceSchema } from "./conversation.schemas.js";
import { chooseConversation } from "./conversation.service.js";

export async function registerConversationRoutes(server: FastifyInstance) {
  server.post<{ Params: { relationshipId: string }; Body: { packKey: string | null } }>(
    "/api/journey/relationships/:relationshipId/conversation-choice",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { relationshipId } = request.params;
      if (!(await isRelationshipMember(relationshipId, user.id))) {
        return sendError(reply, 403, "You do not have access to this relationship space.");
      }

      const parsed = conversationChoiceSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Choose a valid conversation.");
      if (
        parsed.data.packKey !== null &&
        !conversationPacks.some((pack) => pack.key === parsed.data.packKey)
      ) {
        return sendError(reply, 400, "Choose a valid conversation.");
      }

      const result = await chooseConversation(relationshipId, user.id, parsed.data.packKey);

      if ("error" in result && result.error) {
        return sendError(reply, 409, result.error);
      }

      const partner = await prisma.relationshipMember.findFirst({
        where: { relationshipId, userId: { not: user.id } },
        include: { user: true },
      });
      if (partner?.user.email) {
        const chosenTitle =
          parsed.data.packKey === null
            ? "either conversation"
            : getConversationPack(parsed.data.packKey).title;
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
            : `${user.name ?? "Your partner"} selected ${chosenTitle}. You can accept it, suggest another topic, or choose “Either works for me.”`,
          actionLabel: result.started ? "Begin privately" : "Review the choices",
          url: `${env.APP_URL}/journey`,
        });
      }

      return reply.code(result.started ? 201 : 200).send(result);
    },
  );

  server.delete<{ Params: { relationshipId: string } }>(
    "/api/journey/relationships/:relationshipId/conversation-choice",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      if (!(await isRelationshipMember(request.params.relationshipId, user.id))) {
        return sendError(reply, 403, "You do not have access to this relationship space.");
      }

      await prisma.conversationChoice.deleteMany({
        where: { relationshipId: request.params.relationshipId, userId: user.id },
      });
      return { withdrawn: true };
    },
  );

}
