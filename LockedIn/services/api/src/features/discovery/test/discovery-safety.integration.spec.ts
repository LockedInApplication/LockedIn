import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "./discovery-connection.fixtures.js";
vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("canonical discovery safety", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>, f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { server = await (await import("../../../app.js")).buildServer(); await server.listen({ port: 0, host: "127.0.0.1" }); f = connectionFixtures(server); });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  it("blocks across both surfaces, keeps private names out of both block lists and never reopens on unblock", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person();
    const sent = await f.send(a,b); expect(sent.statusCode).toBe(200); const id=sent.json().value.id;
    await f.request(b,"POST",`/api/discovery/connections/${id}/accept`,{});
    await f.request(a,"POST",`/api/discovery/connections/${id}/readiness`,{ready:true,consentVersion:1});
    const blocked=await f.request(a,"POST","/api/discovery/blocks",{connectionId:id}); expect(blocked.statusCode).toBe(200);
    const blockId=blocked.json().value.id;
    for (const path of ["/api/discovery/blocks","/api/journey/invitation-blocks"]) {
      const list=await f.request(a,"GET",path); expect(list.statusCode).toBe(200); expect(JSON.stringify(list.json())).not.toMatch(/PRIVATE AUTH NAME|@example/); expect(JSON.stringify(list.json())).toContain("Chosen alias");
    }
    expect((await f.request(b,"POST","/api/journey/invites",{email:a.email})).statusCode).toBe(409);
    expect((await f.send(b,a)).statusCode).toBe(404);
    expect((await f.request(b,"DELETE",`/api/discovery/blocks/${blockId}`,{})).statusCode).toBe(404);
    const read=(await f.request(b,"GET",`/api/discovery/connections/${id}`)).json().value;
    expect(read.state).toBe("CLOSED"); expect(read.readiness).toMatchObject({mine:false,theirs:false}); expect(JSON.stringify(read)).not.toMatch(/blocker|HARASSMENT|reporter/);
    await prisma.invitationBlock.create({data:{blockerId:b.id,blockedId:a.id,safePublicLabel:"Chosen alias"}});
    expect((await f.request(a,"DELETE",`/api/discovery/blocks/${blockId}`,{})).statusCode).toBe(200);
    expect(await prisma.invitationBlock.count({where:{blockerId:b.id,blockedId:a.id}})).toBe(1);
    expect((await f.request(a,"GET",`/api/discovery/connections/${id}`)).json().value.state).toBe("CLOSED");
  });
  it("legacy block closes exploratory consent with rollout off and leaves the existing deep relationship intact", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a=await f.person(), b=await f.person(), sent=await f.send(a,b); expect(sent.statusCode).toBe(200); const id=sent.json().value.id;
    await f.request(b,"POST",`/api/discovery/connections/${id}/accept`,{});
    const relationship=await prisma.relationship.create({data:{members:{create:[{userId:a.id},{userId:b.id}]}}});
    const invite=await prisma.relationshipInvite.create({data:{inviterId:a.id,inviteeId:b.id,inviteeEmail:b.email,token:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
    process.env.DISCOVERY_ENABLED="false";
    expect((await f.request(b,"POST",`/api/journey/invites/${invite.token}/block`,{})).statusCode).toBe(200);
    expect((await prisma.discoveryConnection.findUniqueOrThrow({where:{id}})).state).toBe("CLOSED");
    expect((await prisma.relationship.findUniqueOrThrow({where:{id:relationship.id}})).status).toBe("ACTIVE");
    f.configure();
  });
  it("reports only authorized server snapshots, keeps partner drafts out, deduplicates receipts and permits history safety after rollout removal", async () => {
    const { prisma }=await import("../../../lib/prisma.js");
    const a=await f.person(),b=await f.person(),c=await f.person(), sent=await f.send(a,b); expect(sent.statusCode).toBe(200); const id=sent.json().value.id;
    await f.request(b,"POST",`/api/discovery/connections/${id}/accept`,{});
    const ownDraft=await prisma.discoveryDraft.create({data:{connectionId:id,ownerId:a.id,text:"SECRET UNSHARED"}});
    const input={sourceType:"INVITATION",sourceId:id,reason:"SPAM",detail:"Please review",requestId:randomUUID()};
    expect((await f.request(c,"POST","/api/discovery/reports",input)).statusCode).toBe(404);
    expect((await f.request(b,"POST","/api/discovery/reports",{...input,sourceType:"SHARED_RESPONSE",sourceId:ownDraft.id})).statusCode).toBe(404);
    expect((await f.request(b,"POST","/api/discovery/reports",{...input,evidence:{text:"Fabricated"}})).statusCode).toBe(400);
    process.env.DISCOVERY_ENABLED="false";
    const receipt=await f.request(b,"POST","/api/discovery/reports",input); expect(receipt.statusCode).toBe(200);
    expect((await f.request(b,"POST","/api/discovery/reports",input)).json().value).toEqual(receipt.json().value);
    expect(await prisma.discoveryReport.count({where:{reporterId:b.id}})).toBe(1);
    const report=await prisma.discoveryReport.findFirstOrThrow({where:{reporterId:b.id}});
    expect(JSON.stringify(report)).not.toMatch(/SECRET UNSHARED|PRIVATE AUTH NAME|@example/);
    expect(JSON.stringify(receipt.json())).not.toMatch(/evidence|reportedUserId|reporterId|Please review/);
    expect((await f.request(b,"POST","/api/discovery/blocks",{connectionId:id})).statusCode).toBe(200);
    f.configure();
  });
  it("block racing acceptance/build prevents subsequent contact without ending a committed deep space", async () => {
    const { prisma }=await import("../../../lib/prisma.js");
    const a=await f.person(),b=await f.person(),sent=await f.send(a,b); expect(sent.statusCode).toBe(200); const id=sent.json().value.id;
    await Promise.all([f.request(a,"POST","/api/discovery/blocks",{connectionId:id}), f.request(b,"POST",`/api/discovery/connections/${id}/accept`,{})]);
    expect((await f.request(b,"GET",`/api/discovery/connections/${id}`)).json().value.state).toBe("CLOSED");
    expect((await f.request(b,"POST",`/api/discovery/connections/${id}/readiness`,{ready:true,consentVersion:1})).statusCode).toBe(409);
    expect(await prisma.relationshipMember.count({where:{userId:a.id}})).toBe(0);
  });
  it("replays a combined public-profile report/block after visibility is gone, without burning more quota",async()=>{
    const {prisma}=await import("../../../lib/prisma.js");
    const a=await f.person(),b=await f.person();
    const input={sourceType:"PROFILE",sourceId:b.profileId,reason:"SPAM",blockAlso:true,requestId:randomUUID()};
    const first=await f.request(a,"POST","/api/discovery/reports",input);expect(first.statusCode).toBe(200);
    await prisma.discoveryThrottle.updateMany({where:{userId:a.id,action:"report:86400000"},data:{count:999}});
    process.env.DISCOVERY_ENABLED="false";
    const retry=await f.request(a,"POST","/api/discovery/reports",input);expect(retry.statusCode).toBe(200);expect(retry.json().value).toEqual(first.json().value);
    f.configure();
  });
});
