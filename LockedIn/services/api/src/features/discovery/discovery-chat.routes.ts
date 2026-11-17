import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { discoveryPairEligible } from "./discovery-connection.service.js";
import { respondDiscovery } from "./discovery-connection.routes.js";
import { requireDiscoveryMutation } from "./discovery.http.js";
import { lockDiscoveryConnection, lockDiscoveryUsers } from "./discovery-locks.js";
import { discoveryConnectionParams } from "./discovery.schemas.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
import type { DiscoveryMessage, Prisma } from "../../../generated/prisma/client.js";

export const discoveryChatEnabled = () => process.env.DISCOVERY_CHAT_ENABLED === "true";
const missing = { ok: false as const, status: 404, error: "This chat isn’t available." };
const conflict = { ok: false as const, status: 409, error: "This message changed. Please try sending it again." };
const messageInput = z.strictObject({ text: z.string().trim().min(1).max(2000).refine(v => !v.includes("\u0000")), requestId: z.string().uuid() });
const querySchema = z.strictObject({ before: z.string().regex(/^[1-9][0-9]{0,18}$/).refine(v => v.length < 19 || v <= "9223372036854775807").optional() });
const pageSize = 30;

async function openChat(tx: Prisma.TransactionClient, id: string, actor: string) {
  const previous = await tx.discoveryConnection.findUnique({ where: { id } });
  if (!previous || previous.state !== "ACCEPTED" || ![previous.userLowId, previous.userHighId].includes(actor)) return null;
  // Block, moderation and close use the same account-first lock order.
  await lockDiscoveryUsers(tx, [previous.userLowId, previous.userHighId]);
  await lockDiscoveryConnection(tx, id);
  const row = await tx.discoveryConnection.findUnique({ where: { id } });
  if (!row || row.state !== "ACCEPTED" || !await discoveryPairEligible(tx, row)) return null;
  return row;
}

function messageView(row: DiscoveryMessage, actor: string) {
  return { id: row.id, sequence: String(row.sequence), author: row.senderId === actor ? "self" as const : "partner" as const, text: row.text, createdAt: row.createdAt.toISOString() };
}

export function registerDiscoveryChatRoutes(server: FastifyInstance) {
  const path = "/api/discovery/connections/:id/messages";
  server.get(path, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!discoveryChatEnabled()) return sendError(reply, 404, missing.error);
    const params = discoveryConnectionParams.safeParse(request.params);
    const query = querySchema.safeParse(request.query);
    if (!params.success || !query.success) return sendError(reply, 400, "Invalid chat request.");
    const id = params.data.id, before = query.data.before;
    return respondDiscovery(reply, user.id, await prisma.$transaction(async tx => {
      if (!await openChat(tx, id, user.id)) return missing;
      const rows = await tx.discoveryMessage.findMany({
        where: { connectionId: id, ...(before ? { sequence: { lt: BigInt(before) } } : {}) },
        orderBy: { sequence: "desc" }, take: pageSize + 1,
      });
      const page = rows.slice(0, pageSize);
      const nextCursor = rows.length > pageSize ? String(page[page.length - 1]!.sequence) : null;
      return { ok: true as const, value: { items: page.reverse().map(row => messageView(row, user.id)), nextCursor } };
    }));
  });
  server.post(path, { bodyLimit: 16_384, config: { discoveryValidation: { body: messageInput, params: discoveryConnectionParams } } }, async (request, reply) => {
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    if (!discoveryChatEnabled()) return sendError(reply, 404, missing.error);
    const { id } = discoveryConnectionParams.parse(request.params);
    const { text, requestId } = messageInput.parse(request.body);
    const result = await prisma.$transaction(async tx => {
      const row = await openChat(tx, id, actor.userId);
      if (!row) return missing;
      const prior = await tx.discoveryMessage.findUnique({ where: { connectionId_senderId_requestId: { connectionId: id, senderId: actor.userId, requestId } } });
      if (prior) return prior.text !== text ? conflict : { ok: true as const, value: messageView(prior, actor.userId) };
      const quota = await consumeDiscoveryQuota(tx, actor.userId, "chat"); if (!quota.ok) return quota;
      const saved = await tx.discoveryMessage.create({ data: { connectionId: id, senderId: actor.userId, requestId, text } });
      return { ok: true as const, value: messageView(saved, actor.userId), notify: [row.userLowId, row.userHighId] };
    });
    if (result.ok && "notify" in result && result.notify) {
      for (const userId of result.notify) notificationBroker.publish(userId, false, "chat");
    }
    return respondDiscovery(reply, actor.userId, result);
  });
}
