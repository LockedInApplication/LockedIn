import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "../../discovery/test/discovery-connection.fixtures.js";
import { createPerson } from "../../discovery/test/discovery.fixtures.js";
import { Prisma } from "../../../../generated/prisma/client.js";
vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("invited partner canonical chat", () => {
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>, f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { process.env.SHARED_MESSAGING_ENABLED = "true"; process.env.DISCOVERY_CHAT_ENABLED = "true"; app = await (await import("../../../app.js")).buildServer(); await app.listen({ port: 0, host: "127.0.0.1" }); f = connectionFixtures(app); });
  afterAll(async () => { process.env = oldEnv; await app?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  async function invite(a: {id: string}, b: {id: string; email: string}) {
    const { prisma } = await import("../../../lib/prisma.js");
    return prisma.relationshipInvite.create({ data: { inviterId: a.id, inviteeId: b.id, inviteeEmail: b.email, expiresAt: new Date(Date.now() + 60000) } });
  }
  it("accepts once with a chat and shared space, without Discovery or a new verification gate", async () => {
    const a = await createPerson(), b = await createPerson(false), i = await invite(a,b);
    const { acceptInvitation } = await import("../../invitations/invitation.service.js");
    const results = await Promise.all([acceptInvitation(i.id,a.id,b.id),acceptInvitation(i.id,a.id,b.id)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    const { prisma } = await import("../../../lib/prisma.js");
    const rel = await prisma.relationship.findFirstOrThrow({ where: { members: { some: { userId: a.id } } } });
    const c = await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: rel.id } });
    expect(c).toMatchObject({ origin: "DIRECT_INVITATION", accessMode: "RELATIONSHIP", directInvitationId: i.id });
    expect(await prisma.discoveryProfile.count({ where: { ownerId: { in: [a.id,b.id] } } })).toBe(0);
    expect(await prisma.chatConversation.count({ where: { relationshipId: rel.id } })).toBe(1);
    expect((await app.inject({ url: `/api/messaging/conversations/${c.id}`, headers: { cookie: b.cookie } })).json().value).toMatchObject({ canChat: false, unavailableReason: "VERIFY_EMAIL" });
  });
  it("rolls acceptance and membership back if conversation creation fails", async () => {
    const a = await createPerson(), b = await createPerson(), i = await invite(a,b);
    const module = await import("../messaging-conversation.service.js");
    const spy = vi.spyOn(module,"attachDirectRelationshipConversation").mockRejectedValueOnce(Error("injected storage failure"));
    try { await expect((await import("../../invitations/invitation.service.js")).acceptInvitation(i.id,a.id,b.id)).rejects.toThrow("injected storage failure"); } finally { spy.mockRestore(); }
    const { prisma } = await import("../../../lib/prisma.js");
    expect((await prisma.relationshipInvite.findUniqueOrThrow({ where: { id: i.id } })).status).toBe("PENDING");
    expect(await prisma.relationshipMember.count({ where: { userId: a.id } })).toBe(0);
  });
  async function discoveryPair() {
    const a = await f.person(), b = await f.person(), sent = await f.send(a,b), id = sent.json().value.id as string;
    await f.request(b,"POST",`/api/discovery/connections/${id}/accept`,{});
    const message = await f.request(a,"POST",`/api/discovery/connections/${id}/messages`,{ text: "Keep this history", requestId: randomUUID() });
    return { a,b,id,message: message.json().value };
  }
  it("reuses eligible Discovery history but does not import a restricted transcript", async () => {
    const { acceptInvitation } = await import("../../invitations/invitation.service.js"), { prisma } = await import("../../../lib/prisma.js");
    const { a,b,id,message } = await discoveryPair(), i = await invite(a,b);
    const result = await acceptInvitation(i.id,a.id,b.id); expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error);
    const c = await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: result.relationship.id } });
    expect(c).toMatchObject({ id, accessMode: "RELATIONSHIP", directInvitationId: i.id });
    const cohort = process.env.DISCOVERY_PILOT_USER_IDS!;
    try {
      process.env.DISCOVERY_PILOT_USER_IDS = cohort.split(",").filter(id => id !== b.id).join(",");
      const metadata = (await app.inject({ url: `/api/messaging/conversations/${id}`, headers: { cookie: a.cookie } })).json().value;
      expect(metadata).toMatchObject({ canChat: true, partner: { publicName: "Your partner" } });
      expect(metadata.profileConnectionId).toBeUndefined();
    } finally { process.env.DISCOVERY_PILOT_USER_IDS = cohort; }
    await prisma.discoveryProfile.update({ where: { ownerId: a.id }, data: { publishedSnapshot: Prisma.DbNull } });
    expect((await app.inject({ url: `/api/messaging/conversations/${id}/messages`, headers: { cookie: a.cookie } })).json().value.items[0].id).toBe(message.id);
    expect((await f.request(a,"GET",`/api/discovery/connections/${id}`)).json().value.canChat).toBe(true);
    const other = await discoveryPair(), j = await invite(other.a,other.b);
    await prisma.discoveryProfile.update({ where: { ownerId: other.a.id }, data: { publishedSnapshot: Prisma.DbNull } });
    const restricted = await acceptInvitation(j.id,other.a.id,other.b.id); if (!restricted.ok) throw Error(restricted.error);
    const fresh = await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: restricted.relationship.id }, include: { messages: true } });
    expect(fresh).toMatchObject({ discoveryConnectionId: null, messages: [] });
    expect(fresh.id).not.toBe(other.id);
  });
  it.each(["discovery", "messaging"] as const)("closing an unrelated %s history leaves the independent shared chat open", async entry => {
    const { acceptInvitation } = await import("../../invitations/invitation.service.js"), { prisma } = await import("../../../lib/prisma.js");
    const { a,b,id } = await discoveryPair(), invitation = await invite(a,b);
    await prisma.discoveryProfile.update({ where: { ownerId: a.id }, data: { publishedSnapshot: Prisma.DbNull } });
    const accepted = await acceptInvitation(invitation.id,a.id,b.id);
    if (!accepted.ok) throw Error(accepted.error);
    const close = entry === "discovery" ? await f.request(a,"POST",`/api/discovery/connections/${id}/close`,{}) :
      await app.inject({ method: "POST", url: `/api/messaging/conversations/${id}/close`, payload: {}, headers: { cookie: a.cookie, origin: "http://localhost:3001", "x-messaging-owner": a.id } });
    expect(close.statusCode).toBe(200);
    expect(await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: accepted.relationship.id } })).toMatchObject({ discoveryConnectionId: null, closedAt: null });
    expect((await app.inject({ url: `/api/messaging/conversations/${accepted.relationship.id}/messages`, headers: { cookie: a.cookie } })).statusCode).toBe(200);
  });
  it("rejects a second same-pair Discovery chat and preserves promotion identity", async () => {
    const { acceptInvitation } = await import("../../invitations/invitation.service.js"), { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person(), pending = await f.send(a,b), pendingId = pending.json().value.id;
    const i = await invite(a,b), result = await acceptInvitation(i.id,a.id,b.id); if (!result.ok) throw Error(result.error);
    const conflict = await f.request(b,"POST",`/api/discovery/connections/${pendingId}/accept`,{});
    expect(conflict.statusCode).toBe(409); expect(conflict.json().conversationId).toBe(result.relationship.id);
    expect((await f.send(a,b)).json().conversationId).toBe(result.relationship.id);
    expect((await prisma.discoveryConnection.findUniqueOrThrow({ where: { id: pendingId } })).state).toBe("PENDING");
    expect((await f.request(b,"POST",`/api/discovery/connections/${pendingId}/decline`,{})).statusCode).toBe(200);
    const p = await discoveryPair(), ready = { ready: true, consentVersion: 1, exclusiveConsent: true };
    await f.request(p.a,"POST",`/api/discovery/connections/${p.id}/readiness`,ready);
    const promoted = await f.request(p.b,"POST",`/api/discovery/connections/${p.id}/readiness`,ready);
    expect(promoted.statusCode).toBe(200);
    expect(await prisma.chatConversation.findUniqueOrThrow({ where: { relationshipId: promoted.json().value.promotedRelationshipId } })).toMatchObject({ id: p.id, accessMode: "DISCOVERY" });
  });
  it("does not enable direct creation when the capability flag is off", async () => {
    const a = await createPerson(), b = await createPerson(), i = await invite(a,b);
    process.env.SHARED_MESSAGING_ENABLED = "false";
    try {
      const result = await (await import("../../invitations/invitation.service.js")).acceptInvitation(i.id,a.id,b.id); if (!result.ok) throw Error(result.error);
      const { prisma } = await import("../../../lib/prisma.js");
      expect(await prisma.chatConversation.findUnique({ where: { relationshipId: result.relationship.id } })).toBeNull();
    } finally { process.env.SHARED_MESSAGING_ENABLED = "true"; }
  });
  it("serializes direct acceptance against promotion without creating two active spaces", async () => {
    const p = await discoveryPair(), i = await invite(p.a,p.b), ready = { ready: true, consentVersion: 1, exclusiveConsent: true };
    await f.request(p.a,"POST",`/api/discovery/connections/${p.id}/readiness`,ready);
    const { acceptInvitation } = await import("../../invitations/invitation.service.js");
    await Promise.all([acceptInvitation(i.id,p.a.id,p.b.id),f.request(p.b,"POST",`/api/discovery/connections/${p.id}/readiness`,ready)]);
    const { prisma } = await import("../../../lib/prisma.js");
    const rels = await prisma.relationship.findMany({ where: { status: "ACTIVE", members: { some: { userId: p.a.id } } } });
    expect(rels).toHaveLength(1);
    expect(await prisma.chatConversation.count({ where: { relationshipId: rels[0]!.id } })).toBe(1);
  },10000);
});
