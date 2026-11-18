import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { connectionFixtures } from './discovery-connection.fixtures.js';
vi.mock('../../../lib/email.js', () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock('../../journey-notifications/journey-email.service.js', () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== 'true')('explicit mutual lock-in preserves chat', () => {
  let app: Awaited<ReturnType<typeof import('../../../app.js').buildServer>>, f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env }, ready = { ready: true, consentVersion: 1, exclusiveConsent: true };
  beforeAll(async () => { process.env.DISCOVERY_CHAT_ENABLED = 'true'; app = await (await import('../../../app.js')).buildServer(); await app.listen({ port: 0, host: '127.0.0.1' }); f = connectionFixtures(app); });
  afterAll(async () => { process.env = oldEnv; await app?.close(); await (await import('../../../lib/prisma.js')).prisma.$disconnect(); });
  async function pair() {
    const a = await f.person(), b = await f.person(), sent = await f.send(a,b), id = sent.json().value.id as string;
    expect((await f.request(b,'POST',`/api/discovery/connections/${id}/accept`,{})).statusCode).toBe(200);
    return { a,b,id,url:`/api/discovery/connections/${id}` };
  }
  it('rejects old build consent and does not count earlier saved choices as lock-in consent', async () => {
    const {prisma} = await import('../../../lib/prisma.js'); const {a,b,id,url} = await pair();
    expect((await f.request(a,'POST',`${url}/readiness`,{ready:true,consentVersion:1})).statusCode).toBe(400);
    await prisma.discoveryConnection.update({where:{id},data:{lowReadinessVersion:1,highReadinessVersion:1}});
    const view = (await f.request(a,'GET',url)).json().value;
    expect(view.readiness).toMatchObject({mine:false,theirs:false});
    expect((await f.request(b,'POST',`${url}/readiness`,ready)).statusCode).toBe(200);
    expect(await prisma.relationshipMember.count({where:{userId:a.id}})).toBe(0);
    expect((await f.request(b,'POST',`${url}/readiness`,{...ready,ready:false})).json().value.readiness.mine).toBe(false);
    expect((await prisma.discoveryProfile.findUniqueOrThrow({where:{ownerId:a.id}})).pausedAt).toBeNull();
  });
  it('pauses both accounts exactly once, denies new invitations and keeps both existing chats usable', async () => {
    const {prisma} = await import('../../../lib/prisma.js'); const {a,b,id,url} = await pair(), c=await f.person(), d=await f.person();
    const other=await f.send(a,c), otherUrl=`/api/discovery/connections/${other.json().value.id}`;
    await f.request(c,'POST',`${otherUrl}/accept`,{});
    const pending=await f.send(d,a), pendingUrl=`/api/discovery/connections/${pending.json().value.id}`;
    expect((await f.request(a,'POST',`${url}/readiness`,ready)).statusCode).toBe(200);
    expect((await f.request(a,'GET','/api/discovery/me')).json().value.canDiscover).toBe(true);
    const results=await Promise.all([f.request(b,'POST',`${url}/readiness`,ready),f.request(b,'POST',`${url}/readiness`,ready)]);
    expect(results.map(r=>r.statusCode)).toEqual([200,200]);
    expect(results[0]!.json().value.promotedRelationshipId).toBe(results[1]!.json().value.promotedRelationshipId);
    expect(results[0]!.json().value.lockedIn).toBe(true);
    for(const person of [a,b]) {
      expect((await f.request(person,'GET','/api/discovery/me')).json().value).toMatchObject({canDiscover:false,canChat:true,discoveryLockedIn:true});
      expect((await prisma.discoveryProfile.findUniqueOrThrow({where:{ownerId:person.id}})).pausedAt).toBeInstanceOf(Date);
      expect((await f.request(person,'POST','/api/discovery/profile/visibility',{paused:false})).statusCode).toBe(403);
      expect((await f.request(person,'GET','/api/discovery/candidates?areaId=pilot-city')).statusCode).toBe(403);
    }
    expect((await f.send(a,d)).statusCode).toBe(409);
    expect((await f.send(d,b)).statusCode).toBe(409);
    expect((await f.request(a,'POST',`${pendingUrl}/accept`,{})).statusCode).toBe(409);
    for(const target of [url,otherUrl]) {
      expect((await f.request(a,'POST',`${target}/messages`,{text:'Chat still works',requestId:randomUUID()})).statusCode).toBe(200);
      expect((await f.request(a,'GET',`${target}/messages`)).json().value.items.at(-1).text).toBe('Chat still works');
    }
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{pausedAt:null}});
    const cards=(await f.request(d,'GET','/api/discovery/candidates?areaId=pilot-city')).json().value.items;
    expect(cards.some((p:{id:string})=>p.id===b.profileId)).toBe(false);
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{suspendedAt:new Date()}});
    expect((await f.request(a,'GET',`${url}/messages`)).statusCode).toBe(404);
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{suspendedAt:null}});
    await f.request(b,'POST','/api/discovery/blocks',{connectionId:id});
    expect((await f.request(a,'GET',`${url}/messages`)).statusCode).toBe(404);
    expect(await prisma.discoveryMessage.count({where:{connectionId:id}})).toBe(1);
  });
  it('does not silently republish after ending the shared space or reinterpret a legacy promotion', async () => {
    const {prisma} = await import('../../../lib/prisma.js'); const {a,b,id,url}=await pair();
    const relationship=await prisma.relationship.create({data:{members:{create:[{userId:a.id},{userId:b.id}]}}});
    await prisma.discoveryConnection.update({where:{id},data:{state:'PROMOTED',relationshipId:relationship.id}});
    expect((await f.request(a,'GET','/api/discovery/me')).json().value).toMatchObject({canDiscover:true,discoveryLockedIn:false});
    expect((await f.request(a,'GET',`${url}/messages`)).statusCode).toBe(404);
    await prisma.discoveryConnection.update({where:{id},data:{lockedInAt:new Date()}});
    await prisma.discoveryProfile.update({where:{ownerId:a.id},data:{pausedAt:new Date()}});
    await prisma.relationship.update({where:{id:relationship.id},data:{status:'ENDED'}});
    expect((await f.request(a,'GET','/api/discovery/me')).json().value.discoveryLockedIn).toBe(false);
    expect((await prisma.discoveryProfile.findUniqueOrThrow({where:{ownerId:a.id}})).pausedAt).toBeInstanceOf(Date);
    expect((await f.request(a,'POST','/api/discovery/profile/visibility',{paused:false})).statusCode).toBe(200);
  });
});
