import { Prisma } from "../../../generated/prisma/client.js";
import { lockDiscoveryUsers } from "../discovery/discovery-locks.js";
import { ensureDiscoveryConversation, ensureRelationshipConversation } from "./messaging-conversation.service.js";

export async function backfillMessaging(tx: Prisma.TransactionClient, options: { afterId?: string; limit: number }) {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500) throw Error("Invalid backfill batch size");
  const rows = await tx.$queryRaw<{ cursor: string; id: string; kind: string }[]>`
    SELECT * FROM (
      SELECT 'D:' || id AS cursor, id, 'D' AS kind FROM "DiscoveryConnection"
      UNION ALL SELECT 'R:' || id AS cursor, id, 'R' AS kind FROM "Relationship" WHERE status = 'ACTIVE'
    ) sources WHERE cursor > ${options.afterId ?? ""} ORDER BY cursor LIMIT ${options.limit}`;
  if (!rows.length) return { nextCursor: null, associated: 0, created: 0 };
  const ds = rows.filter(r => r.kind === "D").map(r => r.id), rs = rows.filter(r => r.kind === "R").map(r => r.id);
  const connections = await tx.discoveryConnection.findMany({ where: { id: { in: ds } } });
  const members = await tx.relationshipMember.findMany({ where: { relationshipId: { in: rs } } });
  await lockDiscoveryUsers(tx, [...connections.flatMap(c => [c.userLowId, c.userHighId]), ...members.map(m => m.userId)]);
  let associated = 0, created = 0;
  for (const row of rows) {
    const before = await tx.chatConversation.count({ where: row.kind === "D" ? { discoveryConnectionId: row.id } : { relationshipId: row.id } });
    if (row.kind === "D") {
      associated += await tx.discoveryMessage.count({ where: { connectionId: row.id, conversationId: null } });
      await ensureDiscoveryConversation(tx, row.id);
    } else {
      // Recheck after locks: a relationship may have ended while the batch waited.
      const rel = await tx.relationship.findUnique({ where: { id: row.id }, include: { members: true } });
      if (rel?.status !== "ACTIVE" || rel.members.length !== 2) continue;
      await ensureRelationshipConversation(tx, row.id);
    }
    if (!before) created++;
  }
  return { nextCursor: rows.length === options.limit ? rows.at(-1)!.cursor : null, associated, created };
}
