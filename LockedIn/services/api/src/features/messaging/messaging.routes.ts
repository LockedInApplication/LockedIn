import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { chatMessageInput, chatParams, chatQuery, emptyChatInput, requireAccountMutationIdentity } from "../../lib/account-mutation-http.js";
import { sharedMessagingEnabled } from "./messaging.config.js";
import { chatMissing, conversationAllowsChat, lockConversation, openConversation } from "./messaging-access.service.js";
import { listMessages, sendMessage } from "./messaging-message.service.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { publicDiscoveryProfile } from "../discovery/discovery-profile.view.js";
import { findConnectedProfile } from "../discovery/discovery-connected-profile.service.js";
import type { ChatResult } from "./messaging.types.js";

export function respondMessaging<T>(reply: FastifyReply, ownerId: string, result: ChatResult<T>) {
  if (!result.ok) { if (result.retryAfter) reply.header("Retry-After", result.retryAfter); return sendError(reply, result.status, result.error); }
  return { ownerId, value: result.value };
}
export async function registerMessagingRoutes(server: FastifyInstance) {
  const base = "/api/messaging/conversations/:id";
  server.get(base, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!sharedMessagingEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = chatParams.safeParse(request.params);
    if (!params.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply, 400, "Invalid chat request.");
    return respondMessaging(reply, user.id, await prisma.$transaction(async tx => {
      const c = await lockConversation(tx, params.data.id, user.id); if (!c) return chatMissing;
      const canChat = await conversationAllowsChat(tx, c);
      const own = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerified: true } });
      const partnerId = c.userLowId === user.id ? c.userHighId : c.userLowId;
      const partner = await tx.user.findUniqueOrThrow({ where: { id: partnerId }, select: { displayName: true, avatarPreset: true } });
      const source = canChat && c.discoveryConnectionId ? await tx.discoveryConnection.findUnique({ where: { id: c.discoveryConnectionId } }) : null;
      const candidate = source ? await tx.discoveryProfile.findUnique({ where: { ownerId: partnerId } }) : null;
      const publicPartner = candidate ? publicDiscoveryProfile(candidate.id, candidate.publishedSnapshot) : null;
      const profile = source && candidate ? await findConnectedProfile(tx, user.id, candidate.id, source.id) : null;
      return { ok: true as const, value: {
        id: c.id, canChat, unavailableReason: canChat ? null : own.emailVerified ? "UNAVAILABLE" : "VERIFY_EMAIL",
        partner: { publicName: canChat ? publicPartner?.publicName ?? partner.displayName ?? "Your partner" : "Your partner", avatarPreset: canChat ? publicPartner?.avatarPreset ?? partner.avatarPreset : "initials" },
        ...(source ? { opening: { questionText: source.questionText, hello: source.hello, author: source.inviterId === user.id ? "self" : "partner", publicName: source.senderPublicName, avatarPreset: source.senderAvatarPreset, connectionId: source.id } } : {}),
        ...(profile ? { profileConnectionId: source!.id } : {}),
      } };
    }));
  });
  server.get("/api/messaging/relationships/:id/conversation", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!sharedMessagingEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = chatParams.safeParse(request.params);
    if (!params.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply, 400, "Invalid chat request.");
    const c = await prisma.chatConversation.findFirst({ where: { relationshipId: params.data.id, relationship: { status: "ACTIVE", members: { some: { userId: user.id } } }, OR: [{ userLowId: user.id }, { userHighId: user.id }] }, select: { id: true } });
    return respondMessaging(reply, user.id, c ? { ok: true, value: c } : chatMissing);
  });
  server.get(`${base}/messages`, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!sharedMessagingEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = chatParams.safeParse(request.params), query = chatQuery.safeParse(request.query);
    if (!params.success || !query.success) return sendError(reply, 400, "Invalid chat request.");
    return respondMessaging(reply, user.id, await prisma.$transaction(async tx => {
      const c = await openConversation(tx, params.data.id, user.id);
      return c ? { ok: true as const, value: await listMessages(tx, c, user.id, query.data.before) } : chatMissing;
    }));
  });
  server.post(`${base}/messages`, { bodyLimit: 16_384 }, async (request, reply) => {
    const actor = await requireAccountMutationIdentity(request, reply, "x-messaging-owner"); if (!actor) return;
    if (!sharedMessagingEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = chatParams.safeParse(request.params), input = chatMessageInput.safeParse(request.body);
    if (!params.success || !input.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply, 400, "Invalid chat request.");
    const result = await prisma.$transaction(async tx => {
      const c = await openConversation(tx, params.data.id, actor.userId);
      return c ? sendMessage(tx, c, actor.userId, input.data) : chatMissing;
    });
    if (result.ok && "notify" in result && result.notify) for (const id of result.notify) notificationBroker.publish(id, false, "chat");
    return respondMessaging(reply, actor.userId, result);
  });
}
