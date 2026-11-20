import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { chatMissing, conversationAllowsChat, openConversation } from "./messaging-access.service.js";
import { messageScope } from "./messaging-message.service.js";
import { sharedMessagingEnabled } from "./messaging.config.js";
import type { ChatResult } from "./messaging.types.js";

type UnreadItem = { conversationId: string; discoveryConnectionId: string | null };
const cap = 100;

export async function listUnreadChats(userId: string): Promise<{ count: number; items: UnreadItem[] }> {
  const items: UnreadItem[] = [];
  let before: bigint | null = null;
  const neutral = sharedMessagingEnabled();
  while (items.length < cap) {
    const rows: { id: string; sequence: bigint }[] = await prisma.$queryRaw`
      SELECT c.id, latest.sequence
      FROM "ChatConversation" c
      LEFT JOIN "ChatReadState" r ON r."conversationId" = c.id AND r."userId" = ${userId}
      LEFT JOIN "DiscoveryConnection" d ON d.id = c."discoveryConnectionId"
      CROSS JOIN LATERAL (
        SELECT MAX(sequence) AS sequence FROM (
          (SELECT m.sequence FROM "DiscoveryMessage" m WHERE m."conversationId" = c.id AND m."senderId" <> ${userId} AND NOT m."unreadAlertSuppressed"
            AND m.sequence > GREATEST(r."through", d."legacyUnreadBaseline", 0) ORDER BY m.sequence DESC LIMIT 1)
          UNION ALL
          (SELECT m.sequence FROM "DiscoveryMessage" m WHERE m."conversationId" IS NULL AND m."connectionId" = c."discoveryConnectionId"
            AND m."senderId" <> ${userId} AND NOT m."unreadAlertSuppressed"
            AND m.sequence > GREATEST(r."through", d."legacyUnreadBaseline", 0) ORDER BY m.sequence DESC LIMIT 1)
        ) candidates
      ) latest
      WHERE (c."userLowId" = ${userId} OR c."userHighId" = ${userId}) AND c."closedAt" IS NULL
        AND (${neutral} OR c."discoveryConnectionId" IS NOT NULL)
        AND latest.sequence IS NOT NULL AND (${before}::bigint IS NULL OR latest.sequence < ${before})
      ORDER BY latest.sequence DESC LIMIT 25
    `;
    if (!rows.length) break;
    const conversations = await prisma.chatConversation.findMany({ where: { id: { in: rows.map(row => row.id) }, closedAt: null,
      OR: [{ userLowId: userId }, { userHighId: userId }] } });
    const byId = new Map(conversations.map(c => [c.id, c]));
    for (const { id } of rows) {
      const c = byId.get(id);
      if (!c || !await conversationAllowsChat(prisma, c, true)) continue;
      items.push({ conversationId: c.id, discoveryConnectionId: c.accessMode === "DISCOVERY" || !neutral ? c.discoveryConnectionId : null });
      if (items.length === cap) break;
    }
    if (rows.length < 25) break;
    before = rows.at(-1)!.sequence;
  }
  return { count: items.length, items };
}

export async function acknowledgeChat(tx: Prisma.TransactionClient, id: string, owner: string, through: bigint): Promise<ChatResult<{ through: string }>> {
  const c = await openConversation(tx, id, owner, true);
  if (!c) return chatMissing;
  const shown = await tx.discoveryMessage.findFirst({ where: { ...messageScope(c), sequence: through, senderId: { not: owner } }, select: { id: true } });
  if (!shown) return chatMissing;
  const [marker] = await tx.$queryRaw<{ through: bigint }[]>`
    INSERT INTO "ChatReadState" ("conversationId", "userId", "through") VALUES (${c.id}, ${owner}, ${through})
    ON CONFLICT ("conversationId", "userId") DO UPDATE SET "through" = GREATEST("ChatReadState"."through", EXCLUDED."through")
    RETURNING "through"
  `;
  return { ok: true, value: { through: String(marker!.through) } };
}
