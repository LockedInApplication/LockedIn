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

export async function checkMessaging(tx: Prisma.TransactionClient) {
  const [counts] = await tx.$queryRaw<{ conversations: bigint; unassociatedMessages: bigint; invalidMessageAssociations: bigint; invalidConversations: bigint; activeRelationshipsWithoutChat: bigint }[]>`
    SELECT
      (SELECT count(*) FROM "ChatConversation") AS conversations,
      (SELECT count(*) FROM "DiscoveryMessage" WHERE "conversationId" IS NULL) AS "unassociatedMessages",
      (SELECT count(*) FROM "DiscoveryMessage" m LEFT JOIN "ChatConversation" c ON c.id=m."conversationId"
       WHERE m."conversationId" IS NOT NULL AND (c.id IS NULL OR m."senderId" NOT IN (c."userLowId",c."userHighId") OR m."connectionId" IS DISTINCT FROM c."discoveryConnectionId")) AS "invalidMessageAssociations",
      (SELECT count(*) FROM "ChatConversation" c LEFT JOIN "DiscoveryConnection" d ON d.id=c."discoveryConnectionId" LEFT JOIN "Relationship" r ON r.id=c."relationshipId" LEFT JOIN "RelationshipInvite" i ON i.id=c."directInvitationId"
       WHERE c."userLowId">=c."userHighId"
       OR (c."discoveryConnectionId" IS NOT NULL AND (d.id IS NULL OR c."userLowId"<>d."userLowId" OR c."userHighId"<>d."userHighId" OR (d."closedAt" IS NOT NULL AND c."closedAt" IS NULL)))
       OR (c."relationshipId" IS NOT NULL AND (r.id IS NULL OR (SELECT count(*) FROM "RelationshipMember" rm WHERE rm."relationshipId"=r.id)<>2 OR (SELECT count(*) FROM "RelationshipMember" rm WHERE rm."relationshipId"=r.id AND rm."userId" IN (c."userLowId",c."userHighId"))<>2))
       OR (c."accessMode"='DISCOVERY' AND (c.origin<>'DISCOVERY' OR d.id IS NULL OR (c."relationshipId" IS NOT NULL AND (d."lockedInAt" IS NULL OR d."relationshipId" IS DISTINCT FROM c."relationshipId"))))
       OR (c."accessMode"='RELATIONSHIP' AND (r.id IS NULL OR d."lockedInAt" IS NOT NULL OR (r.status<>'ACTIVE' AND c."closedAt" IS NULL)))
       OR (c."directInvitationId" IS NOT NULL AND (i.id IS NULL OR i.status<>'ACCEPTED' OR i."inviterId" NOT IN (c."userLowId",c."userHighId") OR i."inviteeId" NOT IN (c."userLowId",c."userHighId") OR i."inviterId"=i."inviteeId"))) AS "invalidConversations",
      (SELECT count(*) FROM "Relationship" r WHERE r.status='ACTIVE' AND (SELECT count(*) FROM "RelationshipMember" rm WHERE rm."relationshipId"=r.id)=2 AND NOT EXISTS (SELECT 1 FROM "ChatConversation" c WHERE c."relationshipId"=r.id)) AS "activeRelationshipsWithoutChat"`;
  if (!counts) throw Error("Integrity counts unavailable");
  return { conversations: Number(counts.conversations), unassociatedMessages: Number(counts.unassociatedMessages), invalidMessageAssociations: Number(counts.invalidMessageAssociations), invalidConversations: Number(counts.invalidConversations), activeRelationshipsWithoutChat: Number(counts.activeRelationshipsWithoutChat) };
}
