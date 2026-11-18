import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../../lib/prisma.js";

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("shared messaging expansion and backfill", () => {
  afterAll(() => prisma.$disconnect());

  it("adds conversation identity without rewriting historical message storage", async () => {
    const tables = await prisma.$queryRaw<{ name: string | null }[]>`SELECT to_regclass('public."ChatConversation"')::text AS name`;
    expect(tables[0]?.name).toBe('"ChatConversation"');
  });

  async function pair() {
    const ids = [randomUUID(), randomUUID()].sort();
    await prisma.user.createMany({ data: ids.map(id => ({ id, email: `${id}@example.test`, emailVerified: true })) });
    return { userLowId: ids[0]!, userHighId: ids[1]! };
  }
  async function relationship(users: Awaited<ReturnType<typeof pair>>, status: "ACTIVE" | "ENDED" = "ACTIVE") {
    return prisma.relationship.create({ data: { status, members: { create: [users.userLowId, users.userHighId].map(userId => ({ userId })) } } });
  }
  async function connection(users: Awaited<ReturnType<typeof pair>>, extra: object = {}) {
    return prisma.discoveryConnection.create({ data: { ...users, inviterId: users.userLowId, questionKey: "support", questionText: "Support?", hello: "Hello", senderPublicName: "Public alias", senderAvatarPreset: "leaf", state: "ACCEPTED", expiresAt: new Date(Date.now() + 60_000), ...extra } });
  }

  it("reruns safely, associates old writers and preserves IDs, receipts, evidence and restricted legacy transcripts", async () => {
    const { backfillMessaging } = await import("../messaging-backfill.service.js");
    const users = await pair(), source = await connection(users);
    const msg = await prisma.discoveryMessage.create({ data: { connectionId: source.id, senderId: users.userLowId, requestId: randomUUID(), text: "Existing message" } });
    const report = await prisma.discoveryReport.create({ data: { reporterId: users.userHighId, reportedUserId: users.userLowId, connectionId: source.id, reason: "SPAM", sourceType: "MESSAGE", sourceId: msg.id, evidence: { text: msg.text }, requestId: randomUUID() } });
    const plainUsers = await pair(), direct = await relationship(plainUsers);
    const legacyUsers = await pair(), legacy = await relationship(legacyUsers);
    const oldSource = await connection(legacyUsers, { state: "PROMOTED", relationshipId: legacy.id });
    await prisma.discoveryMessage.create({ data: { connectionId: oldSource.id, senderId: legacyUsers.userLowId, requestId: randomUUID(), text: "Restricted historical transcript" } });
    const closedUsers = await pair(), explicit = await relationship(closedUsers);
    const closedSource = await connection(closedUsers, { state: "PROMOTED", lockedInAt: new Date(), relationshipId: explicit.id, closedAt: new Date() });
    const blockedUsers = await pair(), blocked = await relationship(blockedUsers);
    await prisma.invitationBlock.create({ data: { blockerId: blockedUsers.userLowId, blockedId: blockedUsers.userHighId } });
    const endedUsers = await pair(), ended = await relationship(endedUsers, "ENDED");
    const legacyClosedUsers = await pair(), legacyClosed = await relationship(legacyClosedUsers);
    await connection(legacyClosedUsers, { state: "PROMOTED", relationshipId: legacyClosed.id, closedAt: new Date() });
    const eligibleUsers = await pair(), eligible = await relationship(eligibleUsers);
    const eligibleSource = await connection(eligibleUsers, { state: "PROMOTED", lockedInAt: new Date(), relationshipId: eligible.id });
    const run = async () => {
      let afterId: string | undefined;
      do {
        const result = await prisma.$transaction(tx => backfillMessaging(tx, { afterId, limit: 3 }));
        afterId = result.nextCursor ?? undefined;
      } while (afterId);
    };
    await run(); await run();
    const saved = await prisma.discoveryMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(saved).toEqual({ ...msg, conversationId: source.id });
    expect(await prisma.discoveryReport.findUniqueOrThrow({ where: { id: report.id } })).toEqual(report);
    expect(await prisma.chatConversation.count({ where: { discoveryConnectionId: source.id } })).toBe(1);
    expect(await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: direct.id } })).toMatchObject({ id: direct.id, origin: "DIRECT_INVITATION", accessMode: "RELATIONSHIP" });
    expect(await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: legacy.id }, include: { messages: true } })).toMatchObject({ id: legacy.id, origin: "LEGACY_RELATIONSHIP", discoveryConnectionId: null, messages: [] });
    expect(await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: explicit.id } })).toMatchObject({ id: closedSource.id, accessMode: "DISCOVERY", closedAt: closedSource.closedAt });
    expect((await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: blocked.id } })).closedAt).not.toBeNull();
    expect(await prisma.chatConversation.findUnique({ where: { relationshipId: ended.id } })).toBeNull();
    expect((await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: legacyClosed.id } })).closedAt).not.toBeNull();
    expect(await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: eligible.id } })).toMatchObject({ id: eligibleSource.id, accessMode: "DISCOVERY", closedAt: null });
    const late = await prisma.discoveryMessage.create({ data: { connectionId: source.id, senderId: users.userLowId, requestId: randomUUID(), text: "Old binary write" } });
    await run();
    expect(await prisma.discoveryMessage.findUniqueOrThrow({ where: { id: late.id } })).toEqual({ ...late, conversationId: source.id });
    expect(await prisma.discoveryMessage.count({ where: { connectionId: source.id } })).toBe(2);
    await prisma.chatConversation.update({ where: { id: direct.id }, data: { closedAt: new Date(), closureReason: "CONTACT_CLOSED" } });
    await run();
    expect((await prisma.chatConversation.findUniqueOrThrow({ where: { id: direct.id } })).closedAt).not.toBeNull();
  });
});
