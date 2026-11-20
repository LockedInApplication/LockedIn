import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { chatParams, chatQuery, emptyChatInput, requireAccountMutationIdentity } from "../../lib/account-mutation-http.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { chatMissing, openConversation } from "../messaging/messaging-access.service.js";
import { respondMessaging } from "../messaging/messaging.routes.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { datePlansEnabled } from "./date-plan-config.js";
import { applyDatePlanAction, getActiveDatePlan, getDatePlan, getDatePlanCalendar, listPlanVenues } from "./date-plan-service.js";
import { datePlanInput } from "./date-plan-types.js";

export async function registerDatePlanRoutes(server: FastifyInstance) {
  const path = "/api/messaging/conversations/:id/date-plans";
  const planParams = chatParams.extend({ planId: z.string().uuid() });
  server.get(path, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!datePlansEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = chatParams.safeParse(request.params);
    if (!params.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply, 400, "Invalid date-plan request.");
    const result = await prisma.$transaction(async tx => {
      const conversation = await openConversation(tx, params.data.id, user.id, true);
      return conversation ? { ok: true as const, value: { activePlan: await getActiveDatePlan(tx, conversation, user.id, new Date()) } } : chatMissing;
    });
    return respondMessaging(reply, user.id, result);
  });
  server.get(path + "/venues", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!datePlansEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = chatParams.safeParse(request.params), query = chatQuery.safeParse(request.query);
    if (!params.success || !query.success) return sendError(reply, 400, "Invalid date-plan request.");
    const result = await prisma.$transaction(async tx => {
      const conversation = await openConversation(tx, params.data.id, user.id, true);
      return conversation ? { ok: true as const, value: await listPlanVenues(tx, conversation, query.data.before) } : chatMissing;
    });
    return respondMessaging(reply, user.id, result);
  });
  server.get(path + "/:planId", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!datePlansEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = planParams.safeParse(request.params);
    if (!params.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply, 400, "Invalid date-plan request.");
    const result = await prisma.$transaction(async tx => {
      const conversation = await openConversation(tx, params.data.id, user.id, true);
      return conversation ? getDatePlan(tx, conversation, user.id, params.data.planId, new Date()) : chatMissing;
    });
    return respondMessaging(reply, user.id, result);
  });
  server.post(path, { bodyLimit: 4096 }, async (request, reply) => {
    const actor = await requireAccountMutationIdentity(request, reply, "x-messaging-owner"); if (!actor) return;
    if (!datePlansEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = chatParams.safeParse(request.params), input = datePlanInput.safeParse(request.body);
    if (!params.success || !input.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply, 400, "Invalid date-plan request.");
    const result = await prisma.$transaction(async tx => {
      const conversation = await openConversation(tx, params.data.id, actor.userId, true);
      return conversation ? applyDatePlanAction(tx, conversation, actor.userId, input.data, new Date()) : chatMissing;
    });
    if (result.ok && result.notify) for (const id of result.notify) notificationBroker.publish(id, false, "chat");
    return respondMessaging(reply, actor.userId, result);
  });
  server.get(path + "/:planId/calendar", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!datePlansEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = planParams.safeParse(request.params);
    if (!params.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply, 400, "Invalid date-plan request.");
    const result = await prisma.$transaction(async tx => {
      const conversation = await openConversation(tx, params.data.id, user.id, true);
      return conversation ? getDatePlanCalendar(tx, conversation, params.data.planId, new Date()) : chatMissing;
    });
    return respondMessaging(reply, user.id, result);
  });
}
