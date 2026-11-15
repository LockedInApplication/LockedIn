import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { isRelationshipMember } from "../relationships/relationship-access.service.js";
import { conversationPacks } from "./conversation.catalog.js";
import { conversationChoiceSchema } from "./conversation.schemas.js";
import { withNotifications } from "../notifications/index.js";
import { registerConversationSuggestionRoutes } from "./conversation-suggestion.routes.js";
import { performConversationChoice } from "./conversation-choice.action.js";

export async function registerConversationRoutes(server: FastifyInstance) {
  await registerConversationSuggestionRoutes(server);
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

      const result = await performConversationChoice(request,user,relationshipId,parsed.data.packKey);

      if ("error" in result) {
        return sendError(reply, 409, result.error??'This conversation is no longer available.');
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

      await withNotifications(request.params.relationshipId, user.id, tx => tx.conversationChoice.deleteMany({
        where: { relationshipId: request.params.relationshipId, userId: user.id },
      }));
      return { withdrawn: true };
    },
  );

}
