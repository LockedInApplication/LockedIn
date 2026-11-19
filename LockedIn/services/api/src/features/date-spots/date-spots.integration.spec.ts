import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "../discovery/test/discovery-connection.fixtures.js";
import { createPerson } from "../discovery/test/discovery.fixtures.js";
import type { PlaceProvider } from "./date-spots-provider.js";

vi.mock("../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("date spots in authorized chats", () => {
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  const oldEnv = { ...process.env };
  const ny = { areaId:"ny-area", label:"Public meetup area", latitude:40.75, longitude:-73.97 };
  const queens = { areaId:"queens-area", label:"Another public meetup area", latitude:40.744,longitude:-73.94 };
  const venue = { id:"known-test-place", name:"Test Gallery", address:"1 Public Way, Test City", categories:["entertainment.culture.gallery"], latitude:40.746,longitude:-73.955 };
  const search = vi.fn<PlaceProvider["search"]>().mockResolvedValue([venue]);
  const details = vi.fn<PlaceProvider["details"]>().mockResolvedValue({ name:venue.name,address:venue.address,website:null,
    mapsUrl:"https://www.openstreetmap.org/",hours:[],photos:[] });
  beforeAll(async () => {
    Object.assign(process.env,{ DATE_SPOTS_ENABLED:"true",DATE_SPOTS_GEOAPIFY_API_KEY:"fake-local-only", SHARED_MESSAGING_ENABLED:"true", DISCOVERY_CHAT_ENABLED:"true",
      DATE_SPOT_AREAS_JSON: JSON.stringify([ny,queens]) });
    app = await (await import("../../app.js")).buildServer({ dateSpotProvider:{search,details} });
    await app.listen({ port:0,host:"127.0.0.1" });
  });
  afterAll(async () => { process.env = oldEnv; await app?.close(); await (await import("../../lib/prisma.js")).prisma.$disconnect(); });
  const chat = (id: string) => `/api/messaging/conversations/${id}`;
  const req = (a: { id:string; cookie:string }, url: string, payload?: object, headers = {}) => app.inject({
    method:payload ? "POST" : "GET",url, headers:{ cookie:a.cookie,origin:"http://localhost:3001","x-messaging-owner":a.id,...headers }, ...(payload ? {payload} : {}),
  });
  const picks = { preferences:{ areaId:ny.areaId,interests:["art"] } };
  it("offers solo results without a partner, then obtains separate consent and never returns the partner's area", async () => {
    const f = connectionFixtures(app), a = await f.person(), b = await f.person(), outsider = await createPerson();
    const invite = await f.send(a,b);
    const id = invite.json().value.id, path = `${chat(id)}/date-spots`;
    expect((await f.request(b,"POST",`/api/discovery/connections/${id}/accept`,{})).statusCode).toBe(200);
    expect((await f.request(a,"GET",`/api/discovery/connections/${id}`)).json().value.dateSpotsConversationId).toBe(id);
    expect((await req(outsider,path)).statusCode).toBe(404);
    expect((await req(a,path,{ action:"solo",...picks },{"x-messaging-owner":b.id})).statusCode).toBe(409);
    expect((await req(a,path,{ action:"solo",...picks },{origin:"https://other.example.test"})).statusCode).toBe(403);
    expect((await req(a,path,{ action:"solo",preferences:{...picks.preferences,latitude:40.75} })).statusCode).toBe(400);

    const solo = await req(a,path,{ action:"solo",...picks,remember:true });
    expect(solo.statusCode).toBe(200);
    expect(solo.headers["cache-control"]).toBe("private, no-store");
    expect(solo.json().value.items[0]).toMatchObject({ name:venue.name });
    expect((await req(a,path)).json().value).toMatchObject({ areaId:ny.areaId, remembered:true });
    const started = (await req(a,path,{ action:"start",...picks })).json().value.request;
    const calls = search.mock.calls.length;
    expect((await req(a,path,{ action:"mutual",id:started.id })).statusCode).toBe(409);
    expect((await req(a,path,{ action:"accept",id:started.id,...picks })).statusCode).toBe(409);
    expect(search.mock.calls.length).toBe(calls);
    const pending = (await req(b,path)).json().value;
    expect(pending).toMatchObject({ areaId:null,request:{id:started.id,from:"partner",state:"pending"} });
    expect(Object.keys(pending.request).sort()).toEqual(["expiresAt","from","id","state"]);
    expect((await req(b,path,{ action:"accept",id:started.id,preferences:{areaId:queens.areaId,interests:["art","coffee"]} })).json().value.request.state).toBe("ready");
    const both = await req(a,path,{ action:"mutual",id:started.id });
    expect(both.statusCode).toBe(200);
    const place = both.json().value.items[0];
    expect(place).toMatchObject({ name:venue.name,reason:"You both like art and culture." });
    expect(JSON.stringify(place)).not.toMatch(/latitude|longitude|queens-area|ny-area/);
    expect((await req(b,path,{action:"details",ticket:place.ticket})).statusCode).toBe(404);
    expect((await req(a,path,{action:"details",ticket:place.ticket})).json().value.venue).toMatchObject({name:venue.name,address:venue.address});
    const share = { action:"share",ticket:place.ticket,requestId:randomUUID() };
    const sent = (await req(a,path,share)).json().value.message;
    expect(sent).toMatchObject({ dateSpot:true,text:`Suggested date spot: ${venue.name}` });
    expect((await req(a,path,share)).json().value.message.id).toBe(sent.id);
    expect((await f.request(b,"GET",`/api/discovery/connections/${id}/messages`)).json().value.items[0]).toMatchObject({id:sent.id,dateSpot:true});
    expect((await req(b,path,{action:"sharedDetails",messageId:sent.id})).json().value.venue.name).toBe(venue.name);
    expect((await req(outsider,path,{action:"sharedDetails",messageId:sent.id})).statusCode).toBe(404);
    expect((await req(b,path,{action:"cancel",id:started.id})).json().value.request).toBeNull();
    expect((await req(a,path,{action:"mutual",id:started.id})).statusCode).toBe(409);
    expect((await req(a,path,{action:"forget"})).statusCode).toBe(200);
    expect((await req(a,path)).json().value.remembered).toBe(false);
    expect((await req(a,path,{ action:"start",...picks })).json().value.request.state).toBe("pending");
    await req(b,`${chat(id)}/block`,{});
    expect((await req(a,path,{action:"sharedDetails",messageId:sent.id})).statusCode).toBe(404);
    const { prisma } = await import("../../lib/prisma.js");
    expect(await prisma.dateSpotRequest.findUnique({where:{conversationId:id}})).toBeNull();
  });
  it("works for direct-invite partners without Discovery and fails closed when disabled", async () => {
    const a = await createPerson(), b = await createPerson(), { prisma } = await import("../../lib/prisma.js");
    const r = await prisma.relationship.create({ data:{members:{create:[a,b].map(user=>({userId:user.id}))}} });
    const { ensureRelationshipConversation } = await import("../messaging/messaging-conversation.service.js");
    const c = await prisma.$transaction(tx => ensureRelationshipConversation(tx,r.id));
    expect((await req(a,chat(c.id))).json().value.dateSpotsConversationId).toBe(c.id);
    expect((await req(a,`${chat(c.id)}/date-spots`)).json().value).toMatchObject({areaId:null,interests:[]});
    expect((await req(a,`${chat(c.id)}/date-spots`,{ action:"solo",...picks })).statusCode).toBe(200);
    process.env.DATE_SPOTS_ENABLED = "false";
    try {
      expect((await req(a,chat(c.id))).json().value).not.toHaveProperty("dateSpotsConversationId");
      expect((await req(a,`${chat(c.id)}/date-spots`)).statusCode).toBe(404);
      expect((await req(a,`${chat(c.id)}/messages`,{ text:"Chat still works.",requestId:randomUUID() })).statusCode).toBe(200);
    } finally { process.env.DATE_SPOTS_ENABLED = "true"; }
  });
});
