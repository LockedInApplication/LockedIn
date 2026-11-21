import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures, publicDraft } from "./discovery-connection.fixtures.js";
import { createPerson } from "./discovery.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("worldwide nearby Discovery", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  const before = { ...process.env };
  const runId = randomUUID().slice(0, 8);
  const check = "/api/discovery/location-check", nearby = "/api/discovery/candidates?mode=nearby";
  const accra = { latitude: 5.56, longitude: -0.20, accuracyMeters: 80 };
  const neighbor = { ...accra, longitude: -0.40 };
  const remote = { latitude: 40.75, longitude: -73.99, accuracyMeters: 80 };
  const enable = (generation: string) => Object.assign(process.env, {
    DISCOVERY_ENABLED: "true", DISCOVERY_ACCESS_MODE: "open", DISCOVERY_MODERATOR_USER_IDS: "fixture-moderator",
    DISCOVERY_LOCATION_MODE: "worldwide", DISCOVERY_LOCATION_GENERATION: `${generation}-${runId}`,
    DISCOVERY_AREAS_JSON: "[]", DISCOVERY_CHAT_ENABLED: "true", DISCOVERY_MATCH_PREFERENCES_REQUIRED: "false",
    DISCOVERY_PHOTOS_ENABLED: "false",
  });
  beforeAll(async () => {
    server = await (await import("../../../app.js")).buildServer();
    await server.listen({ host: "127.0.0.1", port: 0 });
  });
  afterAll(async () => { process.env = before; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });

  it("searches only around fresh device checks, without disclosing the grid", async () => {
    const f = connectionFixtures(server);
    const viewer = await f.person(), local = await f.person(), distant = await f.person(), unchecked = await f.person();
    enable("nearby-a");
    const confirm = await f.request(viewer, "POST", check, accra);
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().value).toEqual({ required: true, mode: "worldwide", areaId: null, expiresAt: expect.any(String) });
    expect((await f.request(local, "POST", check, neighbor)).statusCode).toBe(200);
    expect((await f.request(distant, "POST", check, remote)).statusCode).toBe(200);
    expect((await f.request(viewer, "GET", "/api/discovery/me")).json().value.location).toEqual(confirm.json().value);
    const result = await f.request(viewer, "GET", nearby);
    expect(result.statusCode).toBe(200);
    const items = result.json().value.items;
    expect(items).toMatchObject([{ id: local.profileId, areaId: "nearby" }]);
    expect(items).toHaveLength(1);
    const detail = await f.request(viewer, "GET", `/api/discovery/profiles/${local.profileId}`);
    expect(detail.json().value).toMatchObject({ id: local.profileId, areaId: "nearby" });
    expect(JSON.stringify([items, detail.json()])).not.toMatch(/v1:worldwide|latitude|longitude|expiresAt|pilot-city/);
    const { prisma } = await import("../../../lib/prisma.js");
    const { getPhotoAccess } = await import("../photos/photo-access.service.js");
    Object.assign(process.env,{DISCOVERY_PHOTOS_ENABLED:"true",CLOUDINARY_CLOUD_NAME:"synthetic",CLOUDINARY_API_KEY:"synthetic",CLOUDINARY_API_SECRET:"synthetic"});
    for (const [person, allowed] of [[local, true], [distant, false], [unchecked, false]] as const) {
      const photo = await prisma.discoveryPhoto.create({data:{ownerId:person.id,profileId:person.profileId,requestId:randomUUID(),payloadHash:"a".repeat(64),state:"APPROVED",scanCompleted:true,width:600,height:800,assetId:randomUUID(),publicId:randomUUID(),assetVersion:1}});
      await prisma.discoveryProfile.update({where:{id:person.profileId},data:{publishedSnapshot:{...publicDraft,photoIds:[photo.id]}}});
      expect(!!await getPhotoAccess(viewer.id,photo.id,"ordinary")).toBe(allowed);
    }
    for (const person of [distant, unchecked]) {
      expect((await f.request(viewer, "GET", `/api/discovery/profiles/${person.profileId}`)).statusCode).toBe(404);
      expect((await f.send(viewer, person)).statusCode).toBe(404);
    }
    expect((await f.request(viewer, "GET", "/api/discovery/candidates?areaId=pilot-city")).statusCode).toBe(400);
    expect((await f.request(viewer, "GET", "/api/discovery/candidates?mode=distance")).statusCode).toBe(403);

    const invite = await f.send(viewer, local);
    expect(invite.statusCode).toBe(200);
    const path = `/api/discovery/connections/${invite.json().value.id}`;
    expect((await f.request(local, "POST", check, remote)).statusCode).toBe(200);
    expect((await f.request(local, "GET", path)).json().value.canAccept).toBe(false);
    const report = await f.request(viewer, "POST", "/api/discovery/reports", {sourceType:"PROFILE",sourceId:local.profileId,reason:"SPAM",requestId:randomUUID()});
    expect(report.statusCode).toBe(200);
    expect(report.json().value).toEqual({id:expect.any(String),received:true});
    expect((await f.request(local, "POST", `${path}/accept`, {})).statusCode).toBe(403);
    expect((await f.request(local, "POST", check, neighbor)).statusCode).toBe(200);
    expect((await f.request(local, "POST", `${path}/accept`, {})).statusCode).toBe(200);
    enable("nearby-b");
    expect((await f.request(viewer, "GET", nearby)).statusCode).toBe(403);
    expect((await f.request(viewer, "POST", `${path}/messages`, { requestId: randomUUID(), text: "Still here" })).statusCode).toBe(200);
    delete process.env.DISCOVERY_LOCATION_MODE;
    const state = await f.request(viewer, "GET", "/api/discovery/me");
    expect(state.json().value).toMatchObject({canDiscover:false,canChat:true,hasHistory:true});
    expect((await f.request(viewer, "GET", `${path}/profile`)).statusCode).toBe(200);
    expect((await f.request(viewer, "POST", `${path}/messages`, { requestId: randomUUID(), text: "Still here when Discovery is unavailable" })).statusCode).toBe(200);
  });

  it("paginates past an invalid publication and rejects the old cursor after a recheck", async () => {
    const f = connectionFixtures(server), viewer = await f.person();
    const people: Awaited<ReturnType<typeof f.person>>[] = [];
    for (let n = 0; n < 14; n++) people.push(await f.person());
    people.sort((a, b) => b.profileId.localeCompare(a.profileId));
    const { prisma } = await import("../../../lib/prisma.js");
    enable("pages-a");
    for (const person of [viewer, ...people]) expect((await f.request(person, "POST", check, accra)).statusCode).toBe(200);
    const invalid = people[4]!;
    await prisma.discoveryProfile.update({where:{id:invalid.profileId},data:{publishedSnapshot:{invalid:true}}});
    const first = await f.request(viewer, "GET", nearby);
    expect(first.statusCode).toBe(200);
    expect(first.json().value.items).toHaveLength(12);
    const cursor = first.json().value.nextCursor as string;
    expect(cursor).toEqual(expect.any(String));
    const pageTwo = `${nearby}&before=${encodeURIComponent(cursor)}`;
    const second = await f.request(viewer, "GET", pageTwo);
    expect(second.statusCode).toBe(200);
    expect(second.json().value.items).toHaveLength(1);
    expect(second.json().value.nextCursor).toBeNull();
    const actual = [...first.json().value.items, ...second.json().value.items].map(item => item.id);
    expect(actual).toEqual(people.filter(person => person !== invalid).map(person => person.profileId));
    expect((await f.request(viewer, "POST", check, {...accra, accuracyMeters:6000})).statusCode).toBe(400);
    expect((await f.request(viewer, "GET", pageTwo)).statusCode).toBe(200);
    expect((await f.request(viewer, "POST", check, accra)).statusCode).toBe(200);
    expect((await f.request(viewer, "GET", pageTwo)).statusCode).toBe(400);
    await prisma.discoveryLocationCheck.update({where:{profileId:viewer.profileId},data:{expiresAt:new Date(0)}});
    expect((await f.request(viewer, "GET", nearby)).statusCode).toBe(403);
  });

  it("publishes a neutral profile without a city catalog and keeps it editable after rollback", async () => {
    const f = connectionFixtures(server), person = await createPerson();
    enable("publish-a");
    expect((await f.request(person, "PUT", "/api/discovery/profile", { ...publicDraft, areaId: "other-city", revision: 0 })).statusCode).toBe(400);
    const draft = await f.request(person, "PUT", "/api/discovery/profile", { ...publicDraft, areaId: "nearby", revision: 0 });
    expect(draft.statusCode).toBe(200);
    expect((await f.request(person, "POST", "/api/discovery/profile/publish", { draftRevision: 1, adultAttested: true })).json().value.published.areaId).toBe("nearby");
    expect((await f.request(person, "POST", check, accra)).statusCode).toBe(200);
    Object.assign(process.env, { DISCOVERY_LOCATION_MODE: "metro", DISCOVERY_LOCATION_GENERATION: "metro-r1",
      DISCOVERY_AREAS_JSON: '[{"id":"pilot-city","label":"Pilot city"}]',
      DISCOVERY_VERIFIED_MARKETS_JSON: '[{"areaId":"pilot-city","latitude":5.56,"longitude":-0.2,"radiusKm":40}]' });
    expect((await f.request(person, "GET", "/api/discovery/me")).json().value.location.areaId).toBeNull();
    expect((await f.request(person, "POST", check, accra)).statusCode).toBe(403);
    expect((await f.request(person, "PUT", "/api/discovery/profile", { ...publicDraft, revision: 1 })).statusCode).toBe(200);
    expect((await f.request(person, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true })).json().value.published.areaId).toBe("pilot-city");
    expect((await f.request(person, "POST", check, accra)).json().value.areaId).toBe("pilot-city");
    expect((await f.request(person, "GET", "/api/discovery/candidates?areaId=pilot-city")).statusCode).toBe(200);
  });
});
