import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { isRelationshipMember } from "../relationships/relationship-access.service.js";
import { registerAtlasRoutes } from "../atlas/atlas.routes.js";
import { registerConversationRoutes } from "../conversations/conversation.routes.js";
import { registerCheckInRoutes } from "../check-ins/check-in.routes.js";
import { registerRoadmapRoutes } from "../roadmap/roadmap.routes.js";
import { registerInvitationRoutes } from "../invitations/invitation.routes.js";
import { buildJourneyOverview } from "./overview.service.js";
import { leaveMessagingRelationship } from "../messaging/messaging-lifecycle.service.js";
import { registerNotificationRoutes } from "../notifications/notification.routes.js";
import { registerMemoryRoutes } from "../memories/memory.routes.js";

export async function journeyRoutes(server: FastifyInstance) {
  await registerNotificationRoutes(server);
  await registerAtlasRoutes(server);
  await registerConversationRoutes(server);
  await registerCheckInRoutes(server);
  await registerRoadmapRoutes(server);
  await registerInvitationRoutes(server);
  await server.register(registerMemoryRoutes);

  server.get("/api/journey/overview", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    return buildJourneyOverview(user.id, user);
  });

  server.post<{ Params: { relationshipId: string } }>(
    "/api/journey/relationships/:relationshipId/leave",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      if (!(await isRelationshipMember(request.params.relationshipId, user.id))) {
        return sendError(reply, 404, "Relationship space not found.");
      }

      if (!await leaveMessagingRelationship(request.params.relationshipId,user.id)) return sendError(reply,404,"Relationship space not found.");

      return { left: true };
    },
  );
}
