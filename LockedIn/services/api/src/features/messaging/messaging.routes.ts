import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { chatMessageInput, chatParams, chatMessagesQuery, chatPresentationQuery, chatSequence, emptyChatInput, requireAccountMutationIdentity } from "../../lib/account-mutation-http.js";
import { sharedMessagingEnabled } from "./messaging.config.js";
import { chatMissing, conversationAllowsChat, lockConversation, openConversation } from "./messaging-access.service.js";
import { listMessages, sendMessage } from "./messaging-message.service.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { publicDiscoveryProfile } from "../discovery/discovery-profile.view.js";
import { findConnectedProfile } from "../discovery/discovery-connected-profile.service.js";
import type { ChatResult } from "./messaging.types.js";
import { z } from "zod";
import { changeChatContact, reportMessage } from "./messaging-safety.service.js";
import { dateSpotsAvailable } from "../date-spots/date-spots-config.js";
import { datePlansEnabled } from "../date-plans/date-plan-config.js";
import { acknowledgeChat, listUnreadChats } from "./messaging-unread.service.js";
import { listUnreadDates } from "../date-plans/date-plan-read.service.js";
import { chooseDirectLockIn, directLockInView } from "./messaging-lock-in.service.js";

const reportInput = z.strictObject({ messageId: z.string().uuid(), reason: z.enum(["HARASSMENT","IMPERSONATION","SPAM","OTHER"]), detail: z.string().max(1000).optional(), requestId: z.string().uuid(), blockAlso: z.boolean().optional() });
const lockInInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("request") }),
  z.strictObject({ action: z.enum(["confirm", "withdraw", "pass"]), requestId: z.uuid() }),
]);

export function respondMessaging<T>(reply: FastifyReply, ownerId: string, result: ChatResult<T>) {
  if (!result.ok) { if (result.retryAfter) reply.header("Retry-After", result.retryAfter); return sendError(reply, result.status, result.error); }
  return { ownerId, value: result.value };
}
export async function registerMessagingRoutes(server: FastifyInstance) {
  const base = "/api/messaging/conversations/:id";
  server.post(`${base}/lock-in`, { bodyLimit: 1024 }, async (request, reply) => {
    const actor = await requireAccountMutationIdentity(request, reply, "x-messaging-owner"); if (!actor) return;
    if (!sharedMessagingEnabled()) return sendError(reply, 404, chatMissing.error);
    const params = chatParams.safeParse(request.params), input = lockInInput.safeParse(request.body);
    if (!params.success || !input.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply, 400, "Review your Lock In choice and try again.");
    return respondMessaging(reply, actor.userId, await chooseDirectLockIn(actor.userId, params.data.id, input.data));
  });
  server.get("/api/messaging/unread", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    const query = chatPresentationQuery.safeParse(request.query);
    if (!query.success) return sendError(reply, 400, "Invalid chat request.");
    const sheet = query.data.presentation === "sheet";
    const [chats, dates] = await Promise.all([listUnreadChats(user.id, sheet), sheet ? listUnreadDates(user.id) : null]);
    return respondMessaging(reply, user.id, { ok: true, value: dates ? { ...chats, dates } : chats });
  });
  server.post(`${base}/read`, { bodyLimit: 1024 }, async (request, reply) => {
    const actor = await requireAccountMutationIdentity(request, reply, "x-messaging-owner"); if (!actor) return;
    const params = chatParams.safeParse(request.params), input = z.strictObject({ through: chatSequence }).safeParse(request.body);
    const query = chatPresentationQuery.safeParse(request.query);
    if (!params.success || !input.success || !query.success) return sendError(reply, 400, "Invalid chat request.");
    const result = await prisma.$transaction(tx => acknowledgeChat(tx, params.data.id, actor.userId, BigInt(input.data.through), query.data.presentation === "sheet"));
    if (result.ok) notificationBroker.publish(actor.userId, false, "unread");
    return respondMessaging(reply, actor.userId, result);
  });
  for (const action of ["reports","block","close"] as const) server.post(`${base}/${action}`, { bodyLimit: 16_384 }, async (request,reply) => {
    const actor = await requireAccountMutationIdentity(request,reply,"x-messaging-owner"); if (!actor) return;
    if (!sharedMessagingEnabled()) return sendError(reply,404,chatMissing.error);
    const params = chatParams.safeParse(request.params);
    if (!params.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply,400,"Invalid safety request.");
    if (action === "reports") {
      const input = reportInput.safeParse(request.body);
      if (!input.success) return sendError(reply,400,"Invalid safety request.");
      return respondMessaging(reply,actor.userId,await reportMessage(actor.userId,{ ...input.data, conversationId: params.data.id }));
    }
    if (!emptyChatInput.safeParse(request.body ?? {}).success) return sendError(reply,400,"Invalid safety request.");
    return respondMessaging(reply,actor.userId,await changeChatContact(actor.userId,params.data.id,action));
  });
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
      const profile = source && candidate ? await findConnectedProfile(tx, user.id, candidate.id, source.id) : null;
      const publicPartner = profile ? publicDiscoveryProfile(profile.id, profile.publishedSnapshot) : null;
      return { ok: true as const, value: {
        id: c.id, canChat, unavailableReason: canChat ? null : own.emailVerified ? "UNAVAILABLE" : "VERIFY_EMAIL",
        ...(canChat && dateSpotsAvailable() ? { dateSpotsConversationId: c.id } : {}),
        ...(canChat && datePlansEnabled() ? { datePlansConversationId: c.id } : {}),
        ...(canChat ? { lockIn: await directLockInView(tx, c, user.id) } : {}),
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
    const params = chatParams.safeParse(request.params), query = chatMessagesQuery.safeParse(request.query);
    if (!params.success || !query.success) return sendError(reply, 400, "Invalid chat request.");
    return respondMessaging(reply, user.id, await prisma.$transaction(async tx => {
      const c = await openConversation(tx, params.data.id, user.id);
      return c ? { ok: true as const, value: await listMessages(tx, c, user.id, query.data.before, query.data.presentation === "sheet") } : chatMissing;
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
