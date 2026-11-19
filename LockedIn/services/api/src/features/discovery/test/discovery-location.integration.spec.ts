import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "./discovery-connection.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("location-gated Discovery", () => {
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  const env = { ...process.env };
  const checkPath = "/api/discovery/location-check";
  const market = (areaId: string) => `/api/discovery/candidates?areaId=${areaId}`;
  const accra = { latitude: 5.56, longitude: -0.20, accuracyMeters: 80 };
  const newYork = { latitude: 40.75, longitude: -73.99, accuracyMeters: 80 };
  const setup = () => Object.assign(process.env, {
    DISCOVERY_LOCATION_REQUIRED: "true", DISCOVERY_CHAT_ENABLED: "true",
    DISCOVERY_AREAS_JSON: '[{"id":"pilot-city","label":"Accra"},{"id":"new-york","label":"New York"}]',
    DISCOVERY_VERIFIED_MARKETS_JSON: JSON.stringify([{ ...accra, areaId: "pilot-city", radiusKm: 35 }, { ...newYork, areaId: "new-york", radiusKm: 40 }].map(({ accuracyMeters, ...item }) => item)),
  });
  beforeAll(async () => { app = await (await import("../../../app.js")).buildServer(); await app.listen({ host: "127.0.0.1", port: 0 }); });
  afterAll(async () => { process.env = env; await app?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });

  it("uses recent device metro for both people and denies direct browse and invite bypasses", async () => {
    const f = connectionFixtures(app), local = await f.person(), visitor = await f.person(), remote = await f.person(), unchecked = await f.person();
    setup();
    expect((await f.request(visitor, "GET", market("new-york"))).statusCode).toBe(403);
    expect((await f.request(visitor, "POST", checkPath, { ...accra, areaId: "new-york" })).statusCode).toBe(400);
    const check = await f.request(visitor, "POST", checkPath, accra);
    expect(check.statusCode).toBe(200);
    expect(check.json().value).toMatchObject({ required: true, areaId: "pilot-city" });
    expect(JSON.stringify(check.json())).not.toMatch(/latitude|longitude|accuracy/);
    expect((await f.request(local,"POST",checkPath,newYork)).statusCode).toBe(200);
    expect((await f.request(remote,"POST",checkPath,accra)).statusCode).toBe(200);
    expect((await f.request(visitor,"GET",market("new-york"))).statusCode).toBe(403);
    expect((await f.request(visitor,"GET","/api/discovery/candidates?mode=distance")).statusCode).toBe(403);
    expect((await f.request(visitor,"GET",`/api/discovery/profiles/${local.profileId}`)).statusCode).toBe(404);
    expect((await f.send(visitor, local)).statusCode).toBe(404);
    expect((await f.send(visitor, unchecked)).statusCode).toBe(404);
    expect((await f.request(visitor,"POST","/api/discovery/distance-preferences/locations",{ query: "New York" })).statusCode).toBe(403);
    expect((await f.request(visitor,"GET",market("pilot-city"))).json().value.items.map((item: {id: string}) => item.id)).toEqual([remote.profileId]);
    expect((await f.request(visitor,"POST",checkPath,newYork)).json().value.areaId).toBe("new-york");
    expect((await f.request(visitor,"GET",market("new-york"))).json().value.items).toMatchObject([{ id: local.profileId, areaId: "new-york" }]);
    expect((await f.request(visitor,"GET",`/api/discovery/profiles/${local.profileId}`)).json().value.areaId).toBe("new-york");
    const invited = await f.send(visitor, local);
    expect(invited.statusCode).toBe(200);
    const path = `/api/discovery/connections/${invited.json().value.id}`;
    expect((await f.request(local,"POST",`${path}/accept`,{})).statusCode).toBe(200);
    const { prisma } = await import("../../../lib/prisma.js");
    await prisma.discoveryLocationCheck.update({ where: { profileId: visitor.profileId }, data: { expiresAt: new Date(0) } });
    expect((await f.request(visitor,"GET",market("new-york"))).statusCode).toBe(403);
    expect((await f.request(visitor,"POST",`${path}/messages`,{requestId:randomUUID(),text:"Existing chat still works"})).statusCode).toBe(200);
  });

  it("clears the old market after an accurate check outside supported areas", async () => {
    const f = connectionFixtures(app), actor = await f.person();
    setup();
    await f.request(actor,"POST",checkPath,accra);
    const inaccurate = await f.request(actor,"POST",checkPath,{ ...accra, accuracyMeters: 25000 });
    expect(inaccurate.statusCode).toBe(400);
    expect((await f.request(actor,"POST",checkPath,{ latitude: 0, longitude: 0, accuracyMeters: 50 })).json().value).toEqual({ required: true, areaId: null, expiresAt: null });
    expect((await f.request(actor,"GET",market("pilot-city"))).statusCode).toBe(403);
    expect((await f.request(actor,"GET","/api/discovery/me")).json().value).toMatchObject({ canChat: true, location: { required: true, areaId: null } });
  });

  it("checks pending acceptance against the current metro while allowing a decline", async () => {
    const f = connectionFixtures(app), sender = await f.person(), recipient = await f.person();
    setup();
    expect((await f.request(sender, "POST", checkPath, newYork)).statusCode).toBe(200);
    expect((await f.request(recipient, "POST", checkPath, newYork)).statusCode).toBe(200);
    const invitation = await f.send(sender, recipient);
    expect(invitation.statusCode).toBe(200);
    const path = `/api/discovery/connections/${invitation.json().value.id}`;
    expect((await f.request(recipient, "POST", checkPath, accra)).statusCode).toBe(200);
    expect((await f.request(recipient, "POST", `${path}/accept`, {})).statusCode).toBe(403);
    expect((await f.request(recipient, "POST", `${path}/decline`, {})).json().value.state).toBe("DECLINED");
  });

  it("does not fall back to manual city selection when enabled with an invalid market catalog", async () => {
    const f = connectionFixtures(app), actor = await f.person();
    setup();
    expect((await f.request(actor, "POST", checkPath, accra)).statusCode).toBe(200);
    process.env.DISCOVERY_VERIFIED_MARKETS_JSON = "[]";
    expect((await f.request(actor, "POST", checkPath, accra)).statusCode).toBe(503);
    expect((await f.request(actor, "GET", market("pilot-city"))).statusCode).toBe(403);
    process.env.DISCOVERY_LOCATION_REQUIRED = "false";
    expect((await f.request(actor, "POST", checkPath, accra)).statusCode).toBe(404);
    expect((await f.request(actor, "GET", market("pilot-city"))).statusCode).toBe(200);
  });
});
