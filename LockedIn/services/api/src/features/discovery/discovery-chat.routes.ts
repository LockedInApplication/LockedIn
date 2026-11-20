import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { chatMessageInput, chatMessagesQuery } from "../../lib/account-mutation-http.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { respondDiscovery } from "./discovery-connection.routes.js";
import { requireDiscoveryMutation } from "./discovery.http.js";
import { lockDiscoveryUsers } from "./discovery-locks.js";
import { discoveryConnectionParams } from "./discovery.schemas.js";
import { ensureDiscoveryConversation } from "../messaging/messaging-conversation.service.js";
import { chatMissing, openConversation } from "../messaging/messaging-access.service.js";
import { listMessages, sendMessage } from "../messaging/messaging-message.service.js";
import type { Prisma } from "../../../generated/prisma/client.js";

export const discoveryChatEnabled = () => process.env.DISCOVERY_CHAT_ENABLED === "true";
async function openLegacyChat(tx: Prisma.TransactionClient, id: string, actorId: string) {
  const source = await tx.discoveryConnection.findUnique({ where: { id } });
  if (!source || ![source.userLowId, source.userHighId].includes(actorId)) return null;
  await lockDiscoveryUsers(tx, [source.userLowId, source.userHighId]);
  const c = await ensureDiscoveryConversation(tx, id);
  return openConversation(tx, c.id, actorId, true);
}
export function registerDiscoveryChatRoutes(server: FastifyInstance) {
  const path = "/api/discovery/connections/:id/messages";
  server.get(path, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!discoveryChatEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = discoveryConnectionParams.safeParse(request.params), query = chatMessagesQuery.safeParse(request.query);
    if (!params.success || !query.success) return sendError(reply, 400, "Invalid chat request.");
    return respondDiscovery(reply, user.id, await prisma.$transaction(async tx => {
      const c = await openLegacyChat(tx, params.data.id, user.id);
      return c ? { ok: true as const, value: await listMessages(tx, c, user.id, query.data.before, query.data.presentation === "sheet") } : chatMissing;
    }));
  });
  server.post(path, { bodyLimit: 16_384, config: { discoveryValidation: { body: chatMessageInput, params: discoveryConnectionParams } } }, async (request, reply) => {
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    if (!discoveryChatEnabled()) return sendError(reply, 404, chatMissing.error);
    const { id } = discoveryConnectionParams.parse(request.params), input = chatMessageInput.parse(request.body);
    const result = await prisma.$transaction(async tx => {
      const c = await openLegacyChat(tx, id, actor.userId);
      return c ? sendMessage(tx, c, actor.userId, input) : chatMissing;
    });
    if (result.ok && "notify" in result && result.notify) for (const userId of result.notify) notificationBroker.publish(userId, false, "chat");
    return respondDiscovery(reply, actor.userId, result);
  });
}
