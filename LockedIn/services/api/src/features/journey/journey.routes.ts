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

export async function journeyRoutes(server: FastifyInstance) {
  await registerAtlasRoutes(server);
  await registerConversationRoutes(server);
  await registerCheckInRoutes(server);
  await registerRoadmapRoutes(server);
  await registerInvitationRoutes(server);

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

      await prisma.relationship.update({
        where: { id: request.params.relationshipId },
        data: { status: "ENDED" },
      });

      return { left: true };
    },
  );
}
