import { prisma } from "../api/src/lib/prisma.js";
import { backfillMessaging } from "../api/src/features/messaging/messaging-backfill.service.js";

const mode = process.argv.slice(2);
if (mode.length !== 1 || !["--check", "--apply"].includes(mode[0]!)) throw Error("Usage: tsx scripts/backfill-messaging.ts --check|--apply");
try {
  if (mode[0] === "--apply") {
    let nextCursor: string | null = null, created = 0, associated = 0;
    do {
      const batch = await prisma.$transaction(tx => backfillMessaging(tx, { afterId: nextCursor ?? undefined, limit: 100 }), { timeout: 30_000 });
      nextCursor = batch.nextCursor; created += batch.created; associated += batch.associated;
    } while (nextCursor);
    console.log(JSON.stringify({ created, associated }));
  }
  console.log(JSON.stringify({ conversations: await prisma.chatConversation.count(), unassociatedMessages: await prisma.discoveryMessage.count({ where: { conversationId: null } }), activeRelationshipsWithoutChat: await prisma.relationship.count({ where: { status: "ACTIVE", chatConversation: null } }) }));
} finally { await prisma.$disconnect(); }
