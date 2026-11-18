import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { connectionFixtures, publicDraft } from './discovery-connection.fixtures.js';
vi.mock('../../../lib/email.js', () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock('../../journey-notifications/journey-email.service.js', () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== 'true')('connection-scoped published profiles', () => {
  let app: Awaited<ReturnType<typeof import('../../../app.js').buildServer>>, f: ReturnType<typeof connectionFixtures>;
  const oldEnv={...process.env};
  beforeAll(async()=>{app=await(await import('../../../app.js')).buildServer();await app.listen({port:0,host:'127.0.0.1'});f=connectionFixtures(app);});
  afterAll(async()=>{process.env=oldEnv;await app?.close();await(await import('../../../lib/prisma.js')).prisma.$disconnect();});
  async function pair(){const a=await f.person(),b=await f.person(),other=await f.person(),sent=await f.send(a,b),id=sent.json().value.id as string,url=`/api/discovery/connections/${id}`;return{a,b,other,id,url,profile:`${url}/profile`};}
  it('shows only the partner published profile to accepted participants, including while paused',async()=>{
    const {prisma}=await import('../../../lib/prisma.js');const {a,b,other,url,profile}=await pair();
    expect((await f.request(a,'GET',profile)).statusCode).toBe(404);
    await f.request(b,'POST',`${url}/accept`,{});
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{pausedAt:new Date(),draft:{revision:2,profile:{...publicDraft,bio:'UNPUBLISHED SECRET'}}}});
    await prisma.discoveryDistancePreference.create({data:{profileId:b.profileId,latitude:40.123456,longitude:-73.123456,maxDistanceMiles:25}});
    const response=await f.request(a,'GET',profile);expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json()).toMatchObject({ownerId:a.id,value:{id:b.profileId,bio:'Public introduction'}});
    expect(JSON.stringify(response.json())).not.toMatch(/UNPUBLISHED SECRET|latitude|longitude|email|ownerId.*ownerId|cookie|requestId/);
    expect((await f.request(other,'GET',profile)).statusCode).toBe(404);
    expect((await f.request(b,'GET',profile)).json().value.id).toBe(a.profileId);
    expect((await f.request(a,'GET',`${profile}?ownerId=${other.id}`)).statusCode).toBe(400);
  });
  it('retains profile and approved photo access after mutual lock-in, but revocation and provider-read races win',async()=>{
    const {prisma}=await import('../../../lib/prisma.js');const {getPhotoAccess,readPhoto}=await import('../photos/photo-access.service.js');
    const {a,b,other,id,url,profile}=await pair();await f.request(b,'POST',`${url}/accept`,{});
    Object.assign(process.env,{DISCOVERY_PHOTOS_ENABLED:'true',CLOUDINARY_CLOUD_NAME:'synthetic',CLOUDINARY_API_KEY:'synthetic',CLOUDINARY_API_SECRET:'synthetic'});
    const photo=await prisma.discoveryPhoto.create({data:{ownerId:b.id,profileId:b.profileId,requestId:randomUUID(),payloadHash:'a'.repeat(64),state:'APPROVED',scanCompleted:true,width:600,height:800,assetId:randomUUID(),publicId:randomUUID(),assetVersion:1}});
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{publishedSnapshot:{...publicDraft,photoIds:[photo.id]}}});
    const ready={ready:true,consentVersion:1,exclusiveConsent:true};
    await f.request(a,'POST',`${url}/readiness`,ready);expect((await f.request(b,'POST',`${url}/readiness`,ready)).statusCode).toBe(200);
    const view=await f.request(a,'GET',profile);expect(view.statusCode).toBe(200);expect(view.json().value.photos[0].id).toBe(photo.id);
    expect(await getPhotoAccess(a.id,photo.id,'ordinary')).not.toBeNull();
    expect(await getPhotoAccess(other.id,photo.id,'ordinary')).toBeNull();
    const bytes=await readPhoto(a.id,photo.id,'ordinary',{read:async()=>{await prisma.discoveryPhoto.update({where:{id:photo.id},data:{revokedAt:new Date()}});return Buffer.from('synthetic');}} as unknown as Parameters<typeof readPhoto>[3]);
    expect(bytes).toBeNull();expect(await getPhotoAccess(a.id,photo.id,'ordinary')).toBeNull();
    expect((await f.request(a,'GET',profile)).json().value.photos??[]).toHaveLength(0);
    await f.request(b,'POST','/api/discovery/blocks',{connectionId:id});expect((await f.request(a,'GET',profile)).statusCode).toBe(404);
  });
  it.each(['block','suspend'] as const)('never reopens locked-in contact after %s is reversed, without ending the shared space',async restriction=>{
    const {prisma}=await import('../../../lib/prisma.js'),{getPhotoAccess}=await import('../photos/photo-access.service.js');
    const {a,b,id,url,profile}=await pair(),moderator=await f.person();
    Object.assign(process.env,{DISCOVERY_CHAT_ENABLED:'true',DISCOVERY_PHOTOS_ENABLED:'true',CLOUDINARY_CLOUD_NAME:'synthetic',CLOUDINARY_API_KEY:'synthetic',CLOUDINARY_API_SECRET:'synthetic'});
    await f.request(b,'POST',`${url}/accept`,{});
    const photo=await prisma.discoveryPhoto.create({data:{ownerId:b.id,profileId:b.profileId,requestId:randomUUID(),payloadHash:'a'.repeat(64),state:'APPROVED',scanCompleted:true,width:600,height:800,assetId:randomUUID(),publicId:randomUUID(),assetVersion:1}});
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{publishedSnapshot:{...publicDraft,photoIds:[photo.id]}}});
    const ready={ready:true,consentVersion:1,exclusiveConsent:true};await f.request(a,'POST',`${url}/readiness`,ready);
    const promoted=await f.request(b,'POST',`${url}/readiness`,ready);expect(promoted.statusCode).toBe(200);
    const relationshipId=promoted.json().value.promotedRelationshipId;
    expect((await f.request(a,'POST',`${url}/messages`,{text:'Preserve this message',requestId:randomUUID()})).statusCode).toBe(200);
    expect((await f.request(a,'GET',profile)).statusCode).toBe(200);
    if(restriction==='block'){
      const block=await f.request(a,'POST','/api/discovery/blocks',{connectionId:id});expect(block.statusCode).toBe(200);
      expect((await f.request(a,'DELETE',`/api/discovery/blocks/${block.json().value.id}`,{})).statusCode).toBe(200);
    }else{
      const report=await f.request(b,'POST','/api/discovery/reports',{sourceType:'INVITATION',sourceId:id,reason:'HARASSMENT',requestId:randomUUID()});expect(report.statusCode).toBe(200);
      process.env.DISCOVERY_MODERATOR_USER_IDS=moderator.id;
      expect((await f.request(moderator,'POST',`/api/discovery/moderation/reports/${report.json().value.id}/review`,{action:'SUSPEND',requestId:randomUUID()})).statusCode).toBe(200);
      expect((await f.request(moderator,'POST',`/api/discovery/moderation/profiles/${a.profileId}/restore`,{requestId:randomUUID()})).statusCode).toBe(200);
    }
    for(const person of [a,b]){
      expect((await f.request(person,'GET',`${url}/messages`)).statusCode).toBe(404);
      expect((await f.request(person,'POST',`${url}/messages`,{text:'Must not send',requestId:randomUUID()})).statusCode).toBe(404);
      expect((await f.request(person,'GET',profile)).statusCode).toBe(404);
      expect((await f.request(person,'GET','/api/discovery/me')).json().value.discoveryLockedIn).toBe(true);
    }
    expect(await getPhotoAccess(a.id,photo.id,'ordinary')).toBeNull();
    expect((await prisma.relationship.findUniqueOrThrow({where:{id:relationshipId}})).status).toBe('ACTIVE');
    expect(await prisma.discoveryMessage.count({where:{connectionId:id}})).toBe(1);
  });
  it('lets connected participants report the published profile and approved photos while locked in',async()=>{
    const {prisma}=await import('../../../lib/prisma.js');const {a,b,other,url}=await pair();
    Object.assign(process.env,{DISCOVERY_PHOTOS_ENABLED:'true',CLOUDINARY_CLOUD_NAME:'synthetic',CLOUDINARY_API_KEY:'synthetic',CLOUDINARY_API_SECRET:'synthetic'});
    await f.request(b,'POST',`${url}/accept`,{});
    const photo=await prisma.discoveryPhoto.create({data:{ownerId:b.id,profileId:b.profileId,requestId:randomUUID(),payloadHash:'a'.repeat(64),state:'APPROVED',scanCompleted:true,width:600,height:800,assetId:randomUUID(),publicId:randomUUID(),assetVersion:1}});
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{publishedSnapshot:{...publicDraft,photoIds:[photo.id]},draft:{revision:2,profile:{...publicDraft,bio:'PRIVATE DRAFT'}}}});
    const ready={ready:true,consentVersion:1,exclusiveConsent:true};await f.request(a,'POST',`${url}/readiness`,ready);await f.request(b,'POST',`${url}/readiness`,ready);
    for(const [sourceType,sourceId] of [['PROFILE',b.profileId],['PHOTO',photo.id]]){
      const body={sourceType,sourceId,reason:'HARASSMENT',requestId:randomUUID()};
      expect((await f.request(other,'POST','/api/discovery/reports',body)).statusCode).toBe(404);
      const receipt=await f.request(a,'POST','/api/discovery/reports',body);expect(receipt.statusCode).toBe(200);
      const report=await prisma.discoveryReport.findUniqueOrThrow({where:{id:receipt.json().value.id}});
      expect(report.reportedUserId).toBe(b.id);expect(JSON.stringify(report.evidence)).not.toContain('PRIVATE DRAFT');
    }
  });
  it('denies suspended, unverified, unpublished and closed partners instead of exposing saved drafts',async()=>{
    const {prisma}=await import('../../../lib/prisma.js');const {a,b,id,url,profile}=await pair();await f.request(b,'POST',`${url}/accept`,{});
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{suspendedAt:new Date()}});expect((await f.request(a,'GET',profile)).statusCode).toBe(404);
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{suspendedAt:null}});
    await prisma.user.update({where:{id:b.id},data:{emailVerified:false}});expect((await f.request(a,'GET',profile)).statusCode).toBe(404);
    await prisma.user.update({where:{id:b.id},data:{emailVerified:true}});
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{publishedAt:null}});expect((await f.request(a,'GET',profile)).statusCode).toBe(404);
    await prisma.discoveryProfile.update({where:{ownerId:b.id},data:{publishedAt:new Date()}});
    await prisma.discoveryConnection.update({where:{id},data:{state:'CLOSED'}});expect((await f.request(a,'GET',profile)).statusCode).toBe(404);
  });
});
