import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "./discovery-connection.fixtures.js";
vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("mutual current build consent", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>, f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { server = await (await import("../../../app.js")).buildServer(); await server.listen({ port: 0, host: "127.0.0.1" }); f = connectionFixtures(server); });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  async function pair() {
    const a = await f.person(), b = await f.person(), sent = await f.send(a, b); expect(sent.statusCode).toBe(200);
    const id = sent.json().value.id; await f.request(b, "POST", `/api/discovery/connections/${id}/accept`, {});
    return { a, b, id, url: `/api/discovery/connections/${id}` };
  }
  const ready = { ready: true, consentVersion: 1 };
  it("requires two current choices, promotes exactly once, keeps starters separate and does not publish private answers", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const { a, b, id, url } = await pair(), c = await f.person();
    expect((await f.send(a, c)).statusCode).toBe(200);
    const first = await f.request(a, "POST", `${url}/readiness`, ready); expect(first.statusCode).toBe(200);
    expect(first.json().value.readiness.mine).toBe(true); expect(first.json().value.promotedRelationshipId).toBeNull();
    expect(await prisma.relationshipMember.count({ where: { userId: a.id } })).toBe(0);
    const revoke = await f.request(a, "POST", `${url}/readiness`, {ready:false,consentVersion:1}); expect(revoke.statusCode).toBe(200); expect(revoke.json().value.readiness.mine).toBe(false);
    await f.request(a, "POST", `${url}/readiness`, ready);
    const results = await Promise.all([f.request(b, "POST", `${url}/readiness`, ready), f.request(b, "POST", `${url}/readiness`, ready), f.request(a, "POST", `${url}/readiness`, ready)]);
    expect(results.every(response => response.statusCode === 200)).toBe(true);
    const promoted = results[0]!.json().value.promotedRelationshipId; expect(typeof promoted).toBe("string");
    expect(results.map(response => response.json().value.promotedRelationshipId)).toEqual([promoted, promoted, promoted]);
    expect(await prisma.relationshipMember.count({ where: { userId: a.id } })).toBe(1);
    const relationship = await prisma.relationship.findUniqueOrThrow({ where: {id:promoted}, include: {members:true} });
    expect(new Set(relationship.members.map(member=>member.userId))).toEqual(new Set([a.id,b.id]));
    expect((await prisma.discoveryConnection.findUniqueOrThrow({where:{id}})).state).toBe("PROMOTED");
    expect(await prisma.intentionSession.count({where:{relationshipId:promoted}})).toBe(0);
    expect(await prisma.discoveryConnection.count({where:{inviterId:a.id,state:"PENDING"}})).toBe(1);
    expect((await prisma.discoveryProfile.findUniqueOrThrow({where:{ownerId:a.id}})).pausedAt).toBeNull();
    expect((await f.send(a,b)).statusCode).toBe(409);
    expect((await f.request(a,"GET",`/api/discovery/profiles/${b.profileId}`)).statusCode).toBe(404);
  });
  it("keeps an existing deep space byte-for-byte and returns a neutral unavailable result", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const { a,b,url } = await pair(), c = await f.person();
    const existing = await prisma.relationship.create({data:{members:{create:[{userId:b.id},{userId:c.id}]}}});
    const before = await prisma.relationship.findUniqueOrThrow({where:{id:existing.id},include:{members:true}});
    expect((await f.request(a,"GET",url)).json().value.canChooseBuild).toBe(false);
    const result = await f.request(a,"POST",`${url}/readiness`,ready); expect(result.statusCode).toBe(409);
    expect(JSON.stringify(result.json())).not.toContain(existing.id);
    expect(await prisma.relationship.findUniqueOrThrow({where:{id:existing.id},include:{members:true}})).toEqual(before);
    expect(await prisma.relationshipMember.count({where:{userId:a.id}})).toBe(0);
  });
  it("invalidates choices on close, rejects stale versions, and permits revocation after admission removal", async () => {
    const { a,b,url } = await pair();
    expect((await f.request(a,"POST",`${url}/readiness`,ready)).statusCode).toBe(200);
    process.env.DISCOVERY_ENABLED="false";
    expect((await f.request(b,"POST",`${url}/readiness`,ready)).statusCode).toBe(409);
    const revoked = await f.request(a,"POST",`${url}/readiness`,{ready:false,consentVersion:1}); expect(revoked.statusCode).toBe(200); expect(revoked.json().value.readiness.mine).toBe(false);
    f.configure();
    expect((await f.request(a,"POST",`${url}/readiness`,{ready:true,consentVersion:0})).statusCode).toBe(409);
    await f.request(a,"POST",`${url}/close`,{});
    expect((await f.request(b,"POST",`${url}/readiness`,ready)).statusCode).toBe(409);
    expect((await f.request(a,"GET",url)).json().value.readiness).toMatchObject({mine:false,theirs:false});
  });
  it("shares account locks with legacy acceptance against a third person", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const { a,b,url } = await pair(), c = await f.person();
    await f.request(a,"POST",`${url}/readiness`,ready);
    const invite = await prisma.relationshipInvite.create({data:{inviterId:c.id,inviteeId:b.id,inviteeEmail:b.email,token:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
    const { acceptInvitation } = await import("../../invitations/invitation.service.js");
    const [discovery,legacy] = await Promise.all([f.request(b,"POST",`${url}/readiness`,ready),acceptInvitation(invite.id,c.id,b.id)]);
    expect(discovery.statusCode).toBe(legacy.ok ? 409 : 200);
    expect(await prisma.relationship.count({where:{status:"ACTIVE",members:{some:{userId:b.id}}}})).toBe(1);
  });
});
