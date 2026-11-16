import { afterAll, describe, expect, it } from "vitest";
import { createPerson } from "./discovery.fixtures.js";

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("discovery additive SQL schema", () => {
  afterAll(async () => { await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  it("creates all isolated feature tables and the live-attempt partial unique index", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('DiscoveryProfile','DiscoveryConnection','DiscoveryDraft','DiscoverySharedResponse','PrivateReflection','DiscoveryReport','DiscoveryModerationAudit','DiscoveryThrottle')`;
    expect(tables).toHaveLength(8);
    const indexes = await prisma.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE indexname='DiscoveryConnection_live_pair_key'`;
    expect(indexes).toHaveLength(1);
    expect(indexes[0]!.indexdef).toContain("UNIQUE");
    expect(indexes[0]!.indexdef).toContain("PENDING");
    expect(indexes[0]!.indexdef).toContain("ACCEPTED");
  });
  it("preserves historical private answers, consent, chapter content and notifications without publication", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    expect(await prisma.relationship.findUniqueOrThrow({ where: { id: "discovery-preserved-relationship" } })).toMatchObject({ status: "ACTIVE" });
    expect(await prisma.intentionResponse.findUniqueOrThrow({ where: { id: "discovery-preserved-response" } })).toMatchObject({ answers: { private: "legacy answer" }, shareKeys: ["private"], revealConsentedAt: new Date("2026-01-01T00:00:00Z") });
    expect(await prisma.meaningChapter.findUniqueOrThrow({ where: { id: "discovery-preserved-chapter" } })).toMatchObject({ sharedDefinition: "legacy shared definition" });
    expect(await prisma.notification.findUniqueOrThrow({ where: { recipientId_eventKey: { recipientId: "discovery-preserved-a", eventKey: "discovery-preserved-event" } } })).toMatchObject({ entityId: "discovery-preserved-chapter", discoveryConnectionId: null });
    expect(await prisma.discoveryProfile.count({ where: { ownerId: { in: ["discovery-preserved-a", "discovery-preserved-b"] } } })).toBe(0);
  });
  it("prevents duplicate live attempts but permits a new attempt after a terminal state", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const [a,b] = await Promise.all([createPerson(),createPerson()]);
    const [userLowId,userHighId] = [a.id,b.id].sort() as [string,string];
    const data = { userLowId, userHighId, inviterId: a.id, questionKey: "synthetic", questionText: "Synthetic question?", hello: "Hello", senderPublicName: "Public alias", senderAvatarPreset: "initials", expiresAt: new Date(0) };
    const first = await prisma.discoveryConnection.create({ data });
    // A past expiresAt alone cannot bypass the unique live-attempt constraint.
    await expect(prisma.discoveryConnection.create({ data })).rejects.toThrow();
    await prisma.discoveryConnection.update({ where: { id: first.id }, data: { state: "EXPIRED" } });
    const second = await prisma.discoveryConnection.create({ data: { ...data, state: "ACCEPTED" } });
    await expect(prisma.discoveryConnection.create({ data })).rejects.toThrow();
    await prisma.discoveryConnection.update({ where: { id: second.id }, data: { state: "CLOSED" } });
    expect((await prisma.discoveryConnection.create({ data })).id).not.toBe(first.id);
    await expect(prisma.discoveryConnection.create({ data: { ...data, userLowId: userHighId, userHighId: userLowId } })).rejects.toThrow();
  });
  it("separates profile drafts, published snapshots and versioned shared answers", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const [a,b] = await Promise.all([createPerson(),createPerson()]);
    const profile = await prisma.discoveryProfile.create({ data: { ownerId: a.id, draft: { bio: "private draft" }, publishedSnapshot: { publicName: "Public alias", bio: "published bio" }, publicationVersion: 1 } });
    await prisma.discoveryProfile.update({ where: { id: profile.id }, data: { draft: { bio: "changed private draft" } } });
    expect((await prisma.discoveryProfile.findUniqueOrThrow({ where: { id: profile.id } })).publishedSnapshot).toEqual({ publicName: "Public alias", bio: "published bio" });
    const [userLowId,userHighId] = [a.id,b.id].sort() as [string,string];
    const connection = await prisma.discoveryConnection.create({ data: { userLowId,userHighId,inviterId:a.id,questionKey:"synthetic",questionText:"Synthetic question?",hello:"Hello",senderPublicName:"Public alias",senderAvatarPreset:"initials",expiresAt:new Date() } });
    await prisma.discoveryDraft.create({ data: { connectionId: connection.id, ownerId: a.id, text: "private answer" } });
    const shared = { connectionId: connection.id, ownerId: a.id, text: "explicit shared snapshot", version: 1, requestId: "synthetic-request" };
    await prisma.discoverySharedResponse.create({ data: shared });
    await expect(prisma.discoverySharedResponse.create({ data: { ...shared, version: 2 } })).rejects.toThrow();
    await prisma.discoveryDraft.update({ where: { connectionId_ownerId: { connectionId: connection.id, ownerId: a.id } }, data: { text: "new private answer", revision: { increment: 1 } } });
    expect(await prisma.discoverySharedResponse.findFirstOrThrow({ where: { connectionId: connection.id } })).toMatchObject({ text: "explicit shared snapshot", version: 1 });
    expect(await prisma.intentionResponse.count({ where: { userId: a.id } })).toBe(0);
    await prisma.privateReflection.create({ data: { ownerId: a.id, text: "standalone private reflection" } });
    const block = await prisma.invitationBlock.create({ data: { blockerId: a.id, blockedId: b.id } });
    expect(block.safePublicLabel).toBeNull();
  });
});
