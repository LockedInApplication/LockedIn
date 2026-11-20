import type { FastifyInstance } from "fastify";
import { sendError } from "../../lib/journey-http.js";
import { requireAccountMutationIdentity } from "../../lib/account-mutation-http.js";
import { simplePlanAction, simplePlanCreate } from "./simple-plan.schemas.js";
import { changeSimplePlan, SimplePlanError } from "./simple-plan.service.js";

export function registerSimplePlanRoutes(server: FastifyInstance) {
  server.post<{ Params: { relationshipId: string } }>("/api/journey/relationships/:relationshipId/plans", async (request, reply) => {
    const user = await requireAccountMutationIdentity(request, reply, "x-roadmap-owner");
    if (!user) return;
    const input = simplePlanCreate.safeParse(request.body);
    if (!input.success) return sendError(reply, 400, "Add a clear plan and a valid day, or leave the day blank.");
    try {
      const result = await changeSimplePlan(request.params.relationshipId, user.userId, { id: null, input: input.data });
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof SimplePlanError) return sendError(reply, error.status, error.message);
      throw error;
    }
  });

  server.post<{ Params: { relationshipId: string; planId: string } }>("/api/journey/relationships/:relationshipId/plans/:planId", async (request, reply) => {
    const user = await requireAccountMutationIdentity(request, reply, "x-roadmap-owner");
    if (!user) return;
    const input = simplePlanAction.safeParse(request.body);
    if (!input.success) return sendError(reply, 400, "Check the plan and try again.");
    try {
      return await changeSimplePlan(request.params.relationshipId, user.userId, { id: request.params.planId, input: input.data });
    } catch (error) {
      if (error instanceof SimplePlanError) return sendError(reply, error.status, error.message);
      throw error;
    }
  });
}
