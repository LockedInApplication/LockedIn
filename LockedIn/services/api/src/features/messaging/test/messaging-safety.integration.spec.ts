import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson } from "../../discovery/test/discovery.fixtures.js";
import { connectionFixtures } from "../../discovery/test/discovery-connection.fixtures.js";
vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("shared messaging safety", () => {
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { process.env.SHARED_MESSAGING_ENABLED = "true"; app = await (await import("../../../app.js")).buildServer(); await app.listen({ port: 0, host: "127.0.0.1" }); });
  afterAll(async () => { process.env = oldEnv; await app?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  const request = (a: {id: string; cookie: string}, method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url, headers: { cookie: a.cookie, origin: "http://localhost:3001", "x-messaging-owner": a.id }, ...(payload ? { payload } : {}) });
  async function pair() {
    const a = await createPerson(), b = await createPerson(), { prisma } = await import("../../../lib/prisma.js");
    const i = await prisma.relationshipInvite.create({ data: { inviterId: a.id, inviteeId: b.id, expiresAt: new Date(Date.now()+60000) } });
    const result = await (await import("../../invitations/invitation.service.js")).acceptInvitation(i.id,a.id,b.id); if (!result.ok) throw Error(result.error);
    const c = await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: result.relationship.id } });
    const url = `/api/messaging/conversations/${c.id}`;
    const msg = await request(a,"POST",`${url}/messages`,{ text: "Received evidence", requestId: randomUUID() });
    expect(msg.statusCode).toBe(200);
    return { a,b,c,url, message: msg.json().value };
  }
  it.each(["BLOCK", "SUSPENSION"] as const)("retains %s before a flag-off relationship has been backfilled", async action => {
    const a = await createPerson(), b = await createPerson(), { prisma } = await import("../../../lib/prisma.js");
    const invite = await prisma.relationshipInvite.create({ data: { inviterId: a.id, inviteeId: b.id, expiresAt: new Date(Date.now()+60000) } });
    const { acceptInvitation } = await import("../../invitations/invitation.service.js");
    const { lockDiscoveryUsers } = await import("../../discovery/discovery-locks.js");
    const { ensureRelationshipConversation } = await import("../messaging-conversation.service.js");
    process.env.SHARED_MESSAGING_ENABLED = "false";
    try {
      const accepted = await acceptInvitation(invite.id, a.id, b.id);
      if (!accepted.ok) throw Error(accepted.error);
      const { id } = accepted.relationship;
      expect(await prisma.chatConversation.findUnique({ where: { relationshipId: id } })).toBeNull();
      if (action === "BLOCK") {
        const { blockInvitationSender, unblockInvitations } = await import("../../invitations/invitation-blocks.service.js");
        const block = await blockInvitationSender(invite.token, b);
        if (!block.ok) throw Error(block.error);
        expect((await unblockInvitations(block.id, b.id)).ok).toBe(true);
      } else {
        const moderator = await createPerson();
        process.env.DISCOVERY_MODERATOR_USER_IDS = moderator.id;
        const report = await prisma.discoveryReport.create({ data: { reporterId: b.id, reportedUserId: a.id, reason: "HARASSMENT", sourceType: "MESSAGE", sourceId: randomUUID(), evidence: { text: "Historical report" } } });
        const { reviewDiscoveryReport, restoreReportedAccount } = await import("../../discovery/discovery-moderation.service.js");
        expect((await reviewDiscoveryReport(moderator.id, report.id, { action: "SUSPEND", requestId: randomUUID() })).ok).toBe(true);
        expect((await restoreReportedAccount(moderator.id, report.id, randomUUID())).ok).toBe(true);
      }
      const chat = await prisma.$transaction(async tx => {
        await lockDiscoveryUsers(tx, [a.id, b.id]);
        return ensureRelationshipConversation(tx, id);
      });
      expect(chat.closedAt).not.toBeNull();
      process.env.SHARED_MESSAGING_ENABLED = "true";
      const url = `/api/messaging/conversations/${chat.id}/messages`;
      expect((await request(b,"GET",url)).statusCode).toBe(404);
      expect((await request(b,"POST",url,{ text: "No renewed consent", requestId: randomUUID() })).statusCode).toBe(404);
    } finally { process.env.SHARED_MESSAGING_ENABLED = "true"; }
  });
  it("closes direct chat without ending the relationship or erasing messages", async () => {
    const p = await pair(), { prisma } = await import("../../../lib/prisma.js");
    expect((await request(p.a,"POST",`${p.url}/close`,{})).statusCode).toBe(200);
    expect((await request(p.b,"GET",`${p.url}/messages`)).statusCode).toBe(404);
    expect((await prisma.relationship.findUniqueOrThrow({ where: { id: p.c.relationshipId! } })).status).toBe("ACTIVE");
    expect(await prisma.discoveryMessage.count({ where: { conversationId: p.c.id } })).toBe(1);
    expect((await request(p.a,"POST",`${p.url}/close`,{ partnerId: p.b.id })).statusCode).toBe(400);
  });
  it("keeps a blocked chat closed after unblock and reports received historical evidence exactly once", async () => {
    const p = await pair(), outsider = await createPerson(), { prisma } = await import("../../../lib/prisma.js");
    const blocked = await request(p.b,"POST",`${p.url}/block`,{}); expect(blocked.statusCode).toBe(200);
    await (await import("../../invitations/invitation-blocks.service.js")).unblockInvitations(blocked.json().value.id,p.b.id);
    expect((await request(p.a,"GET",`${p.url}/messages`)).statusCode).toBe(404);
    const body = { messageId: p.message.id, reason: "SPAM", requestId: randomUUID(), blockAlso: false };
    expect((await request(p.a,"POST",`${p.url}/reports`,body)).statusCode).toBe(404);
    expect((await request(outsider,"POST",`${p.url}/reports`,body)).statusCode).toBe(404);
    expect((await request(p.b,"POST",`${p.url}/reports`,{ ...body, evidence: "forged" })).statusCode).toBe(400);
    const receipts = await Promise.all([request(p.b,"POST",`${p.url}/reports`,body),request(p.b,"POST",`${p.url}/reports`,body)]);
    expect(receipts.map(r => r.statusCode)).toEqual([200,200]); expect(receipts[0]!.json()).toEqual(receipts[1]!.json());
    const report = await prisma.discoveryReport.findUniqueOrThrow({ where: { id: receipts[0]!.json().value.id } });
    expect(report).toMatchObject({ conversationId: p.c.id, reportedUserId: p.a.id, sourceId: p.message.id, sourceType: "MESSAGE", evidence: { text: "Received evidence", sentAt: p.message.createdAt } });
    expect(await prisma.discoveryReport.count({ where: { reporterId: p.b.id, requestId: body.requestId } })).toBe(1);
  });
  it("suspends profile-less direct chat durably and keeps reports in the existing moderator queue", async () => {
    const p = await pair(), moderator = await createPerson(), { prisma } = await import("../../../lib/prisma.js");
    process.env.DISCOVERY_MODERATOR_USER_IDS = moderator.id;
    const receipt = await request(p.b,"POST",`${p.url}/reports`,{ messageId: p.message.id, reason: "HARASSMENT", requestId: randomUUID() });
    expect(receipt.statusCode).toBe(200);
    const moderation = await import("../../discovery/discovery-moderation.service.js");
    for (const reportId of [receipt.json().value.id, randomUUID()]) {
      expect(await moderation.restoreReportedAccount(p.a.id,reportId,randomUUID())).toMatchObject({ ok: false, status: 403 });
    }
    expect((await moderation.reviewDiscoveryReport(moderator.id,receipt.json().value.id,{ action: "SUSPEND", requestId: randomUUID() })).ok).toBe(true);
    expect((await prisma.chatConversation.findUniqueOrThrow({ where: { id: p.c.id } })).closedAt).not.toBeNull();
    expect((await request(p.b,"GET",`${p.url}/messages`)).statusCode).toBe(404);
    expect(await prisma.discoveryProfile.count({ where: { ownerId: p.a.id } })).toBe(0);
    const queue = await moderation.listDiscoveryReports(moderator.id); if (!queue.ok) throw Error(queue.error);
    expect(queue.value.items.find(r => r.id === receipt.json().value.id)?.suspended).toBe(true);
    const restored = await app.inject({ method: "POST", url: `/api/discovery/moderation/reports/${receipt.json().value.id}/restore-account`, headers: { cookie: moderator.cookie, origin: "http://localhost:3001", "x-discovery-owner": moderator.id }, payload: { requestId: randomUUID() } });
    expect(restored.statusCode).toBe(200);
    expect((await request(p.b,"GET",`${p.url}/messages`)).statusCode).toBe(404);
    const after = await moderation.listDiscoveryReports(moderator.id); if (!after.ok) throw Error(after.error);
    expect(after.value.items.find(r => r.id === receipt.json().value.id)?.suspended).toBe(false);
  });
  it("ends direct membership under account locks and serializes send against closure", async () => {
    const p = await pair(), { prisma } = await import("../../../lib/prisma.js");
    const [sent, closed] = await Promise.all([request(p.a,"POST",`${p.url}/messages`,{ text: "Race", requestId: randomUUID() }),request(p.b,"POST",`${p.url}/close`,{})]);
    expect([200,404]).toContain(sent.statusCode); expect(closed.statusCode).toBe(200);
    expect((await request(p.a,"POST",`${p.url}/messages`,{ text: "After", requestId: randomUUID() })).statusCode).toBe(404);
    const q = await pair();
    expect((await request(q.a,"POST",`/api/journey/relationships/${q.c.relationshipId}/leave`,{})).statusCode).toBe(200);
    expect((await prisma.chatConversation.findUniqueOrThrow({ where: { id: q.c.id } })).closedAt).not.toBeNull();
    expect((await request(q.b,"GET",`${q.url}/messages`)).statusCode).toBe(404);
  },10000);
  it("closes reused history from either entry and on direct relationship leave", async () => {
    process.env.DISCOVERY_CHAT_ENABLED = "true";
    const f = connectionFixtures(app), { prisma } = await import("../../../lib/prisma.js");
    for (const action of ["close","leave"] as const) {
      const a = await f.person(), b = await f.person(), sent = await f.send(a,b), id = sent.json().value.id as string;
      await f.request(b,"POST",`/api/discovery/connections/${id}/accept`,{});
      const i = await prisma.relationshipInvite.create({ data: { inviterId: a.id, inviteeId: b.id, expiresAt: new Date(Date.now()+60000) } });
      const result = await (await import("../../invitations/invitation.service.js")).acceptInvitation(i.id,a.id,b.id); if (!result.ok) throw Error(result.error);
      const response = action === "close" ? await f.request(a,"POST",`/api/discovery/connections/${id}/close`,{}) : await request(a,"POST",`/api/journey/relationships/${result.relationship.id}/leave`,{});
      expect(response.statusCode).toBe(200);
      expect((await request(b,"GET",`/api/messaging/conversations/${id}/messages`)).statusCode).toBe(404);
      expect((await prisma.chatConversation.findUniqueOrThrow({ where: { id } })).closedAt).not.toBeNull();
      expect((await prisma.discoveryConnection.findUniqueOrThrow({ where: { id } })).closedAt).not.toBeNull();
    }
  },10000);
  it("serializes blocking a direct invitation against acceptance", async () => {
    const a = await createPerson(), b = await createPerson(), { prisma } = await import("../../../lib/prisma.js");
    const i = await prisma.relationshipInvite.create({ data: { inviterId: a.id, inviteeId: b.id, expiresAt: new Date(Date.now()+60000) } });
    const { acceptInvitation } = await import("../../invitations/invitation.service.js"), { blockInvitationSender } = await import("../../invitations/invitation-blocks.service.js");
    await Promise.all([acceptInvitation(i.id,a.id,b.id),blockInvitationSender(i.token,b)]);
    expect(await prisma.invitationBlock.count({ where: { blockerId: b.id, blockedId: a.id } })).toBe(1);
    const c = await prisma.chatConversation.findFirst({ where: { OR: [{ userLowId: a.id, userHighId: b.id },{ userLowId: b.id, userHighId: a.id }] } });
    if (c) expect(c.closedAt).not.toBeNull();
  },10000);
});
