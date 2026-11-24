import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "../../discovery/test/discovery-connection.fixtures.js";
import { createPerson } from "../../discovery/test/discovery.fixtures.js";

vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("direct invitations and mutual Lock In", () => {
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  const oldEnv = { ...process.env };
  beforeAll(async () => {
    process.env.SHARED_MESSAGING_ENABLED = "true";
    process.env.DATE_PLANS_ENABLED = "true";
    app = await (await import("../../../app.js")).buildServer();
  });
  afterAll(async () => {
    await app?.close();
    await (await import("../../../lib/prisma.js")).prisma.$disconnect();
    process.env = oldEnv;
  });

  const request = (person: { id: string; cookie: string }, method: "GET" | "POST", url: string, payload?: object) =>
    app.inject({ method, url, ...(payload ? { payload } : {}), headers: {
      cookie: person.cookie, origin: "http://localhost:3001", "x-messaging-owner": person.id, "x-discovery-owner": person.id,
    } });
  const metadata = (person: { id: string; cookie: string }, id: string) => request(person, "GET", `/api/messaging/conversations/${id}`);

  async function invite(a: {id:string}, b: {id:string;email:string}) {
    const { prisma } = await import("../../../lib/prisma.js");
    return prisma.relationshipInvite.create({ data: { inviterId: a.id, inviteeId: b.id, inviteeEmail: b.email, expiresAt: new Date(Date.now()+60_000) } });
  }

  it("accepts into chat, requires the other person’s current consent, and keeps the same conversation", async () => {
    const fixture = connectionFixtures(app);
    const a = await fixture.person(), b = await fixture.person(), c = await fixture.person();
    const { prisma } = await import("../../../lib/prisma.js");
    const i = await invite(a,b), existing = await invite(a,c);
    const later = await invite(c,a);
    const accept = await request(b,"POST",`/api/journey/invites/${i.token}/accept`);
    expect(accept.statusCode).toBe(201);
    const id = accept.json().conversationId;
    expect(id).toBe(i.id);
    expect(accept.json().relationshipId).toBeUndefined();
    const otherId = (await request(c,"POST",`/api/journey/invites/${existing.token}/accept`)).json().conversationId;
    const chat = `/api/messaging/conversations/${id}`;
    const lock = `${chat}/lock-in`;
    expect((await request(a,"GET","/api/journey/overview")).json()).toMatchObject({
      relationship: null, hasInboxActivity: true, directChats: expect.arrayContaining([expect.objectContaining({ conversationId: id })]),
    });
    expect((await request(a,"GET","/api/discovery/me")).json().value.canDiscover).toBe(true);
    expect((await request(a,"GET","/api/journey/notifications")).json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "DIRECT_INVITATION_ACCEPTED", entityId: id, view: "messages" }),
    ]));
    expect((await metadata(a,id)).json().value).toMatchObject({canChat:true, inTogether:false, lockIn:{state:"available"}, datePlansConversationId:id});
    expect((await request(a,"GET",`${chat}/date-plans`)).statusCode).toBe(200);
    expect((await request(a,"POST",`${chat}/messages`,{ text:"Coffee first?", requestId:randomUUID() })).statusCode).toBe(200);
    expect((await request(c,"POST",lock,{ action:"request" })).statusCode).toBe(404);
    const requested = (await request(a,"POST",lock,{ action:"request" })).json().value;
    expect(requested.state).toBe("requested");
    const tasks = () => prisma.notification.findMany({ where:{kind:"DIRECT_LOCK_IN_REQUEST",entityId:id,recipientId:b.id,resolvedAt:null} });
    expect(await tasks()).toHaveLength(1);
    expect((await request(a,"POST",lock,{ action:"request" })).json().value).toEqual(requested);
    expect(await tasks()).toHaveLength(1);
    expect((await metadata(b,id)).json().value.lockIn).toEqual({state:"received",requestId:requested.requestId});
    expect((await request(a,"GET","/api/journey/overview")).json().relationship).toBeNull();
    expect((await request(a,"POST",lock,{ action:"confirm", requestId:requested.requestId })).statusCode).toBe(409);
    expect((await request(b,"POST",lock,{ action:"pass", requestId:requested.requestId })).json().value).toEqual({state:"available"});
    expect(await tasks()).toHaveLength(0);
    const next = (await request(a,"POST",lock,{ action:"request" })).json().value;
    expect(next.requestId).not.toBe(requested.requestId);
    expect((await request(b,"POST",lock,{ action:"confirm", requestId:requested.requestId })).statusCode).toBe(409);
    expect((await request(b,"POST",lock,{ action:"confirm", requestId:next.requestId })).json().value).toEqual({state:"locked"});
    expect((await request(b,"POST",lock,{ action:"confirm", requestId:next.requestId })).json().value).toEqual({state:"locked"});
    const space = await prisma.relationship.findFirstOrThrow({ where:{ members:{ some:{ userId:a.id } } } });
    expect(space.directLockedInAt).toBeInstanceOf(Date);
    expect(await prisma.relationshipMember.count({where:{userId:a.id}})).toBe(1);
    for(const person of [a,b]) {
      expect((await request(person,"GET","/api/journey/overview")).json()).toMatchObject({
        relationship:{id:space.id,isMutuallyLockedIn:true,mutuallyLockedInAt:space.directLockedInAt!.toISOString()},
        messaging:{conversationId:id},
      });
      expect((await request(person,"GET","/api/discovery/me")).json().value).toMatchObject({canDiscover:false,discoveryLockedIn:true});
      expect((await metadata(person,id)).json().value).toMatchObject({canChat:true, inTogether:true});
    }
    expect((await request(a,"POST",`/api/journey/invites/${later.token}/accept`)).statusCode).toBe(409);
    expect((await request(a,"GET",`${chat}/messages`)).json().value.items[0].text).toBe("Coffee first?");
    expect((await request(a,"POST",`/api/messaging/conversations/${otherId}/messages`,{text:"Existing chats still work",requestId:randomUUID()})).statusCode).toBe(200);
    expect((await request(a,"POST",`/api/journey/relationships/${space.id}/leave`,{})).statusCode).toBe(200);
    for (const person of [a, b]) {
      expect((await request(person,"GET","/api/discovery/me")).json().value).toMatchObject({ canDiscover: true, discoveryLockedIn: false });
      expect((await request(person,"GET",`${chat}/messages`)).statusCode).toBe(404);
      expect((await prisma.discoveryProfile.findUniqueOrThrow({ where: { ownerId: person.id } })).pausedAt).toBeInstanceOf(Date);
    }
    expect(await prisma.chatConversation.findUniqueOrThrow({ where: { id } })).toMatchObject({ closureReason: "RELATIONSHIP_ENDED" });
    expect((await request(a,"POST",`/api/messaging/conversations/${otherId}/messages`,{text:"Other chats stay open",requestId:randomUUID()})).statusCode).toBe(200);
  });

  it("upgrades an existing direct-invite Together space in place", async () => {
    const a = await createPerson(), b = await createPerson(), i = await invite(a,b);
    const { acceptInvitation } = await import("../../invitations/invitation.service.js");
    const { prisma } = await import("../../../lib/prisma.js");
    const old = await acceptInvitation(i.id,a.id,b.id);
    if (!old.ok) throw Error(old.error);
    const conversation = await prisma.chatConversation.findUniqueOrThrow({where:{relationshipId:old.relationship.id}});
    const members = await prisma.relationshipMember.findMany({where:{relationshipId:old.relationship.id},orderBy:{id:"asc"}});
    const lock = `/api/messaging/conversations/${conversation.id}/lock-in`;
    expect((await metadata(a,conversation.id)).json().value.lockIn).toEqual({state:"available"});
    const requestId = (await request(b,"POST",lock,{action:"request"})).json().value.requestId;
    expect((await request(a,"POST",lock,{action:"confirm",requestId})).json().value).toEqual({state:"locked"});
    expect(await prisma.relationshipMember.findMany({where:{relationshipId:old.relationship.id},orderBy:{id:"asc"}})).toEqual(members);
    expect((await request(a,"GET","/api/journey/overview")).json()).toMatchObject({
      relationship:{id:old.relationship.id,isMutuallyLockedIn:true}, messaging:{conversationId:conversation.id},
    });
  });
});
