import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures, publicDraft } from "./discovery-connection.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("private distance preferences", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let f: ReturnType<typeof connectionFixtures>;
  const env = { ...process.env };
  const endpoint = "/api/discovery/distance-preferences";
  const search = "/api/discovery/candidates?mode=distance";
  const privateAddress = "987 Synthetic Street";
  const geocode = vi.fn(async (query: string) => query === privateAddress
    ? [{ label: privateAddress, areaLabel: "Pilot city", latitude: 40.751234, longitude: -73.999876 }]
    : [{ label: "Uptown result", areaLabel: "Other city", latitude: 40.874731, longitude: -73.999876 }]);
  beforeAll(async () => {
    server = await (await import("../../../app.js")).buildServer({ discoveryGeocoder: geocode });
    await server.listen({ host: "127.0.0.1", port: 0 });
    f = connectionFixtures(server);
  });
  afterAll(async () => { process.env = env; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });

  it("keeps coordinates and the typed address private and enforces both limits across city boundaries", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person(), cityOnly = await f.person();
    process.env.DISCOVERY_AREAS_JSON = '[{"id":"pilot-city","label":"Pilot city"},{"id":"other-city","label":"Other city"}]';
    await prisma.discoveryProfile.update({ where: { id: b.profileId }, data: { publishedAreaId: "other-city", publishedSnapshot: { ...publicDraft, areaId: "other-city" } } });
    expect((await f.request(a, "GET", search)).statusCode).toBe(409);
    expect((await f.request(a, "POST", `${endpoint}/locations`, { query: "invalid; query" })).statusCode).toBe(400);
    expect(geocode).not.toHaveBeenCalled();
    const looking = await f.request(a, "POST", `${endpoint}/locations`, { query: privateAddress });
    expect(looking.headers["cache-control"]).toBe("private, no-store");
    const [option] = looking.json().value.locations;
    expect(option.label).toBe(privateAddress);
    const crossAccount = await f.request(b, "PUT", endpoint, { maxDistanceMiles: 10, locationToken: option.token });
    expect(crossAccount.statusCode).toBe(400);
    expect((await f.request(a, "PUT", endpoint, { maxDistanceMiles: 12, locationToken: option.token })).statusCode).toBe(400);
    expect((await f.request(a, "PUT", endpoint, { maxDistanceMiles: 10, latitude: 40.751234, longitude: -73.999876 })).statusCode).toBe(400);
    const chosen = await f.request(a, "PUT", endpoint, { maxDistanceMiles: 10, locationToken: option.token });
    expect(chosen.json().value.preference).toEqual({ areaLabel: "Pilot city", maxDistanceMiles: 10 });
    const stored = await prisma.discoveryDistancePreference.findUniqueOrThrow({ where: { profileId: a.profileId } });
    expect(stored).toMatchObject({ latitude: 40.75, longitude: -74, areaLabel: "Pilot city" });
    expect(JSON.stringify(stored)).not.toContain(privateAddress);
    expect((await f.request(a, "GET", "/api/discovery/candidates?areaId=pilot-city")).statusCode).toBe(409);
    expect((await f.request(cityOnly, "GET", "/api/discovery/candidates?areaId=pilot-city")).json().value.items).toEqual([]);
    expect((await f.request(cityOnly, "GET", `/api/discovery/profiles/${a.profileId}`)).statusCode).toBe(404);

    const bOptions = await f.request(b, "POST", `${endpoint}/locations`, { query: "Uptown" });
    expect((await f.request(b, "PUT", endpoint, { maxDistanceMiles: 5, locationToken: bOptions.json().value.locations[0].token })).statusCode).toBe(200);
    expect((await f.request(a, "GET", search)).json().value.items).toEqual([]);
    expect((await f.request(b, "GET", search)).json().value.items).toEqual([]);
    expect((await f.request(a, "GET", `/api/discovery/profiles/${b.profileId}`)).statusCode).toBe(404);
    expect((await f.send(a, b)).statusCode).toBe(404);

    expect((await f.request(b, "PUT", endpoint, { maxDistanceMiles: 25 })).statusCode).toBe(200);
    const results = await f.request(a, "GET", search);
    expect(results.statusCode).toBe(200);
    expect(results.json().value.items).toEqual([{ id: b.profileId, ...publicDraft, areaId: "other-city" }]);
    const detail = await f.request(a, "GET", `/api/discovery/profiles/${b.profileId}`);
    expect(detail.statusCode).toBe(200);
    expect(JSON.stringify([results.json(), detail.json()])).not.toMatch(/latitude|longitude|maxDistanceMiles|areaLabel|Synthetic Street|Uptown result/);
    const invite = await f.send(a, b, randomUUID());
    expect(invite.statusCode).toBe(200);
    const deleted = await f.request(b, "DELETE", endpoint);
    expect(deleted.json().value.preference).toBeNull();
    expect(await prisma.discoveryDistancePreference.findUnique({ where: { profileId: b.profileId } })).toBeNull();
    expect((await f.request(b, "POST", `/api/discovery/connections/${invite.json().value.id}/accept`, {})).json().value.state).toBe("ACCEPTED");
  });

  it("handles antimeridian neighbors and rejects a page cursor after the viewer changes distance", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const viewer = await f.person(), neighbors = await Promise.all(Array.from({ length: 13 }, () => f.person()));
    await prisma.discoveryDistancePreference.createMany({ data: [
      { profileId: viewer.profileId, latitude: 0, longitude: 179.975, maxDistanceMiles: 10 },
      ...neighbors.map(person => ({ profileId: person.profileId, latitude: 0, longitude: -179.975, maxDistanceMiles: 5 })),
    ] });
    const first = await f.request(viewer, "GET", search);
    expect(first.statusCode).toBe(200);
    expect(first.json().value.items).toHaveLength(12);
    const next = `${search}&before=${encodeURIComponent(first.json().value.nextCursor)}`;
    expect((await f.request(viewer, "GET", next)).json().value.items).toHaveLength(1);
    expect((await f.request(viewer, "PUT", endpoint, { maxDistanceMiles: 25 })).statusCode).toBe(200);
    expect((await f.request(viewer, "GET", next)).statusCode).toBe(400);
  });

  it("pages an open nearby population in ID order without dropping safe profiles between invalid snapshots", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const viewer = await f.person();
    const nearby = await Promise.all(Array.from({ length: 75 }, () => f.person()));
    const excluded = await Promise.all(Array.from({ length: 9 }, () => f.person()));
    const malformed = await Promise.all(Array.from({ length: 35 }, () => f.person()));
    await prisma.discoveryDistancePreference.createMany({ data: [viewer, ...nearby, ...excluded, ...malformed].map(p => ({ profileId: p.profileId, latitude: 70, longitude: 30, maxDistanceMiles: 25 })) });
    await prisma.discoveryProfile.updateMany({ where: { id: { in: malformed.map(p => p.profileId) } }, data: { publishedSnapshot: { ...publicDraft, email: "private@example.test" } } });
    await prisma.discoveryProfile.update({ where: { id: excluded[0]!.profileId }, data: { pausedAt: new Date() } });
    await prisma.discoveryProfile.update({ where: { id: excluded[1]!.profileId }, data: { suspendedAt: new Date() } });
    await prisma.discoveryProfile.update({ where: { id: excluded[2]!.profileId }, data: { publicationConsentedAt: null } });
    await prisma.user.update({ where: { id: excluded[3]!.id }, data: { emailVerified: false } });
    await prisma.invitationBlock.createMany({ data: [{ blockerId: viewer.id, blockedId: excluded[4]!.id }, { blockerId: excluded[5]!.id, blockedId: viewer.id }] });
    await prisma.discoveryDistancePreference.update({ where: { profileId: excluded[6]!.profileId }, data: { latitude: 71, maxDistanceMiles: 5 } });
    await prisma.discoveryProfile.update({ where: { id: excluded[7]!.profileId }, data: { publishedIntention: "UNSUPPORTED" } });
    expect((await f.send(viewer, excluded[8]!)).statusCode).toBe(200);
    Object.assign(process.env, { DISCOVERY_ACCESS_MODE: "open", DISCOVERY_PILOT_USER_IDS: "" });
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const response = await f.request(viewer, "GET", `${search}${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`);
      expect(response.statusCode).toBe(200);
      const value = response.json().value;
      expect(value.items.length).toBeLessThanOrEqual(12);
      expect(JSON.stringify(value)).not.toMatch(/latitude|longitude|private@example|lastDiscoveryActiveOn/);
      seen.push(...value.items.map((p: { id: string }) => p.id));
      cursor = value.nextCursor;
      if (!cursor) break;
    }
    expect(cursor).toBeNull();
    expect(seen).toEqual(nearby.map(p => p.profileId).sort().reverse());
    expect(new Set(seen).size).toBe(75);
    delete process.env.DISCOVERY_ACCESS_MODE;
  });

  it("continues after a bounded scan of malformed snapshots instead of scanning the whole population in one request", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const viewer = await f.person(), safe = await f.person();
    const bad = Array.from({ length: 260 }, (_, index) => ({ id: `ffffffff-ffff-4fff-8fff-${index.toString(16).padStart(12, "0")}`, ownerId: `bad-snapshot-${randomUUID()}` }));
    const now = new Date();
    await prisma.discoveryProfile.update({ where: { id: safe.profileId }, data: { id: "00000000-0000-4000-8000-000000000001" } });
    safe.profileId = "00000000-0000-4000-8000-000000000001";
    await prisma.user.createMany({ data: bad.map(p => ({ id: p.ownerId, email: `${p.ownerId}@example.test`, emailVerified: true })) });
    await prisma.discoveryProfile.createMany({ data: bad.map(p => ({ ...p, draft: {}, publishedSnapshot: { ...publicDraft, email: "private@example.test" }, publishedAreaId: "pilot-city", publishedIntention: "LONG_TERM", adultAttestedAt: now, publicationConsentedAt: now, publishedAt: now, publicationConsentVersion: 1, publicationVersion: 1 })) });
    await prisma.discoveryDistancePreference.createMany({ data: [viewer.profileId, safe.profileId, ...bad.map(p => p.id)].map(profileId => ({ profileId, latitude: -60, longitude: 50, maxDistanceMiles: 25 })) });
    Object.assign(process.env, { DISCOVERY_ACCESS_MODE: "open", DISCOVERY_PILOT_USER_IDS: "" });
    const first = await f.request(viewer, "GET", search);
    expect(first.statusCode).toBe(200);
    expect(first.json().value.items).toEqual([]);
    expect(first.json().value.nextCursor).toBeTypeOf("string");
    const second = await f.request(viewer, "GET", `${search}&before=${encodeURIComponent(first.json().value.nextCursor)}`);
    expect(second.statusCode).toBe(200);
    expect(second.json().value.items.map((p: { id: string }) => p.id)).toEqual([safe.profileId]);
    expect(second.json().value.nextCursor).toBeNull();
  });
});
