import type { ChatConversation, Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { chatMissing, conversationAllowsChat } from "../messaging/messaging-access.service.js";
import { sharedMessagingEnabled } from "../messaging/messaging.config.js";
import { datePlansEnabled } from "./date-plan-config.js";
import type { DatePlanEvent } from "./date-plan-types.js";

type DateUnreadRow = { conversationId: string; planId: string; action: DatePlanEvent["action"]; sequence: bigint };
type DateUnreadItem = { conversationId: string; discoveryConnectionId: string | null; planId: string };

function unreadRows(tx: Prisma.TransactionClient, userId: string, conversationId: string | null, before: bigint | null, limit: number) {
  return tx.$queryRaw<DateUnreadRow[]>`
    SELECT unread.* FROM (
      SELECT p."conversationId", p.id AS "planId", latest.action, latest.sequence
      FROM "ChatDatePlan" p JOIN "ChatConversation" c ON c.id = p."conversationId"
      JOIN "user" u ON u.id = ${userId}
      LEFT JOIN "ChatReadState" legacy ON legacy."conversationId" = c.id AND legacy."userId" = u.id
      LEFT JOIN "DiscoveryConnection" d ON d.id = c."discoveryConnectionId"
      LEFT JOIN "ChatDatePlanRead" r ON r."planId" = p.id AND r."userId" = u.id
      CROSS JOIN LATERAL (
        SELECT m."datePlanEvent"->>'action' AS action, m.sequence
        FROM "DiscoveryMessage" m
        WHERE m."conversationId" = c.id AND m."datePlanEvent" IS NOT NULL AND m."datePlanEvent"->>'id' = p.id
          AND m."senderId" <> u.id AND NOT m."unreadAlertSuppressed"
          AND m.sequence > GREATEST(r."through", legacy."through", d."legacyUnreadBaseline", 0)
        ORDER BY m.sequence DESC LIMIT 1
      ) latest
      WHERE u."inAppActivity" AND (c."userLowId" = u.id OR c."userHighId" = u.id)
        AND c."closedAt" IS NULL AND (${conversationId}::text IS NULL OR c.id = ${conversationId})
    ) unread WHERE (${before}::bigint IS NULL OR unread.sequence < ${before})
    ORDER BY unread.sequence DESC LIMIT ${limit}
  `;
}

export async function getUnreadDateUpdate(tx: Prisma.TransactionClient, conversationId: string, userId: string) {
  const [latest] = await unreadRows(tx, userId, conversationId, null, 1);
  return latest ? { planId: latest.planId, action: latest.action } : null;
}

export async function listUnreadDates(userId: string): Promise<{ count: number; items: DateUnreadItem[] }> {
  const items: DateUnreadItem[] = [];
  if (!datePlansEnabled()) return { count: 0, items };
  const neutral = sharedMessagingEnabled(), access = new Map<string, ChatConversation | null>();
  let before: bigint | null = null;
  while (items.length < 100) {
    const rows: DateUnreadRow[] = await unreadRows(prisma, userId, null, before, 25);
    for (const row of rows) {
      if (!access.has(row.conversationId)) {
        const conversation = await prisma.chatConversation.findFirst({ where: { id: row.conversationId, closedAt: null,
          OR: [{ userLowId: userId }, { userHighId: userId }] } });
        access.set(row.conversationId, conversation && (neutral || conversation.discoveryConnectionId)
          && await conversationAllowsChat(prisma, conversation, true) ? conversation : null);
      }
      const conversation = access.get(row.conversationId);
      if (!conversation) continue;
      items.push({ conversationId: conversation.id, discoveryConnectionId: conversation.accessMode === "DISCOVERY" || !neutral
        ? conversation.discoveryConnectionId : null, planId: row.planId });
      if (items.length === 100) break;
    }
    if (rows.length < 25) break;
    before = rows.at(-1)!.sequence;
  }
  return { count: items.length, items };
}

export async function acknowledgeDatePlan(tx: Prisma.TransactionClient, conversation: ChatConversation, planId: string, userId: string, through: bigint) {
  const plan = await tx.chatDatePlan.findFirst({ where: { id: planId, conversationId: conversation.id }, select: { id: true } });
  const visible = plan && await tx.discoveryMessage.findFirst({ where: {
    conversationId: conversation.id, sequence: through, senderId: { not: userId },
    datePlanEvent: { path: ["id"], equals: planId },
  }, select: { id: true } });
  if (!visible) return chatMissing;
  const [marker] = await tx.$queryRaw<{ through: bigint }[]>`
    INSERT INTO "ChatDatePlanRead" ("planId", "userId", "through") VALUES (${planId}, ${userId}, ${through})
    ON CONFLICT ("planId", "userId") DO UPDATE SET "through" = GREATEST("ChatDatePlanRead"."through", EXCLUDED."through")
    RETURNING "through"
  `;
  return { ok: true as const, value: { through: String(marker!.through) } };
}
