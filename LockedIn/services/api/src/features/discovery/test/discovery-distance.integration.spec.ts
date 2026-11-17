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
});
