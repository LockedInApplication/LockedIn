import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createPerson, discoveryRequest } from "./discovery.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

const snapshot = { publicName: "Public alias", avatarPreset: "leaf", bio: "Public bio", intention: "LONG_TERM", interests: [], pace: null, areaId: "pilot-city" };
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("consent-filtered discovery candidates", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let request: ReturnType<typeof discoveryRequest>;
  let actor: Awaited<ReturnType<typeof createPerson>>;
  const oldEnv = { ...process.env };
  const cohort: string[] = [];
  const configure = () => Object.assign(process.env, { DISCOVERY_ENABLED: "true", DISCOVERY_PILOT_USER_IDS: cohort.join(","), DISCOVERY_MODERATOR_USER_IDS: "synthetic-moderator", DISCOVERY_AREAS_JSON: '[{"id":"pilot-city","label":"Pilot city"},{"id":"other-city","label":"Other city"}]' });
  async function published(options: Record<string, unknown> = {}, verified = true, pilot = true) {
    const person = await createPerson(verified);
    if (pilot) cohort.push(person.id);
    const { prisma } = await import("../../../lib/prisma.js");
    const profile = await prisma.discoveryProfile.create({ data: { ownerId: person.id, draft: { revision: 1, profile: { ...snapshot, bio: "private draft marker" } }, publishedSnapshot: snapshot, publishedAreaId: "pilot-city", publishedIntention: "LONG_TERM", adultAttestedAt: new Date(), publishedAt: new Date(), publicationConsentedAt: new Date(), publicationConsentVersion: 1, publicationVersion: 1, ...options } });
    configure(); return { ...person, profileId: profile.id };
  }
  beforeAll(async () => { server = await (await import("../../../app.js")).buildServer(); await server.listen({ port: 0, host: "127.0.0.1" }); request = discoveryRequest(server); actor = await published(); });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });

  it("requires current actor admission, attestation, publication and unpaused visibility", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    for (const options of [{ adultAttestedAt: null }, { publicationConsentedAt: null }, { publishedSnapshot: null }, { suspendedAt: new Date() }, { pausedAt: new Date() }]) {
      const person = await published(options);
      expect((await request(person, "GET", "/api/discovery/candidates?areaId=pilot-city")).statusCode).toBe(403);
      await prisma.discoveryProfile.update({ where: { id: person.profileId }, data: { pausedAt: new Date() } });
    }
    const unverified = await published({}, false);
    const noncohort = await published({}, true, false);
    expect((await request(unverified, "GET", "/api/discovery/candidates?areaId=pilot-city")).statusCode).toBe(403);
    expect((await request(noncohort, "GET", "/api/discovery/candidates?areaId=pilot-city")).statusCode).toBe(403);
    for (const person of [unverified, noncohort]) expect((await request(person, "POST", "/api/discovery/profile/publish", { draftRevision: 1, adultAttested: true })).statusCode).toBe(403);
    expect((await request(actor, "GET", `/api/discovery/profiles/${noncohort.profileId}`)).statusCode).toBe(404);
  });

  it("filters both block directions and live connections before pagination, and returns no count", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const exclusions = [await published({ publishedAreaId: "other-city", publishedSnapshot: { ...snapshot, areaId: "other-city" } }), await published({ publishedIntention: "UNSUPPORTED", publishedSnapshot: { ...snapshot, intention: "UNSUPPORTED" } }), await published(), await published(), await published(), await published(), await published({ publishedSnapshot: { ...snapshot, email: "private@example.test" } })];
    await prisma.invitationBlock.createMany({ data: [{ blockerId: actor.id, blockedId: exclusions[2]!.id }, { blockerId: exclusions[3]!.id, blockedId: actor.id }] });
    for (const [index, state] of [[4, "PENDING"], [5, "ACCEPTED"]] as const) {
      const partner = exclusions[index]!;
      const [userLowId, userHighId] = [actor.id, partner.id].sort() as [string, string];
      await prisma.discoveryConnection.create({ data: { userLowId, userHighId, inviterId: actor.id, state, questionKey: "synthetic", questionText: "Synthetic?", hello: "Hello", senderPublicName: "Alias", senderAvatarPreset: "sun", expiresAt: new Date(Date.now() + 86400000) } });
    }
    const visible = await Promise.all(Array.from({ length: 14 }, () => published()));
    const first = await request(actor, "GET", "/api/discovery/candidates?areaId=pilot-city");
    expect(first.statusCode).toBe(200);
    expect(first.json().value.items).toHaveLength(12);
    expect(Object.keys(first.json().value).sort()).toEqual(["items", "nextCursor"]);
    const cursor = first.json().value.nextCursor;
    expect(typeof cursor).toBe("string");
    expect((await request(actor, "GET", `/api/discovery/candidates?areaId=other-city&before=${encodeURIComponent(cursor)}`)).statusCode).toBe(400);
    expect((await request(visible[0]!, "GET", `/api/discovery/candidates?areaId=pilot-city&before=${encodeURIComponent(cursor)}`)).statusCode).toBe(400);
    const tampered = cursor.slice(0, -1) + (cursor.endsWith("A") ? "B" : "A");
    expect((await request(actor, "GET", `/api/discovery/candidates?areaId=pilot-city&before=${encodeURIComponent(tampered)}`)).statusCode).toBe(400);
    const second = await request(actor, "GET", `/api/discovery/candidates?areaId=pilot-city&before=${encodeURIComponent(cursor)}`);
    expect(second.json().value.items).toHaveLength(2);
    expect(second.json().value.nextCursor).toBeNull();
    const ids = [...first.json().value.items, ...second.json().value.items].map((item: { id: string }) => item.id);
    expect(new Set(ids)).toEqual(new Set(visible.map(person => person.profileId)));
    for (const person of exclusions.slice(2)) expect((await request(actor, "GET", `/api/discovery/profiles/${person.profileId}`)).statusCode).toBe(404);
    expect((await request(actor, "GET", `/api/discovery/profiles/${(actor as typeof actor & { profileId: string }).profileId}`)).statusCode).toBe(404);
    expect(JSON.stringify(first.json())).not.toMatch(/private draft marker|email|coordinates|activityEmails|PRIVATE AUTH NAME/);
  });

  it("ranks eligible profiles using shared interests, exact intent and coarse activity without exposing that activity", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const city = { publishedAreaId: "other-city" };
    const localSnapshot = { ...snapshot, areaId: city.publishedAreaId };
    const viewer = await published({ ...city, publishedSnapshot: { ...localSnapshot, interests: ["Reading", "Music"] } });
    const active = new Date(new Date().toISOString().slice(0, 10));
    const make = (publicName: string, intention: string, interests: string[], lastDiscoveryActiveOn: Date | null = null) =>
      published({ ...city, publishedSnapshot: { ...localSnapshot, publicName, intention, interests }, publishedIntention: intention, lastDiscoveryActiveOn });
    const [best, shared, activeOnly] = await Promise.all([
      make("Exact with shared interests", "LONG_TERM", ["READING", "MUSIC"]),
      make("Compatible with shared interests", "OPEN_TO_LONG_TERM", ["reading", "Music"]),
      make("Recently active", "LONG_TERM", [], active),
    ]);
    const result = await request(viewer, "GET", "/api/discovery/candidates?areaId=other-city");
    expect(result.statusCode).toBe(200);
    expect(result.json().value.items.slice(0, 3).map((item: { id: string }) => item.id)).toEqual([best.profileId, shared.profileId, activeOnly.profileId]);
    expect(await prisma.discoveryProfile.findUnique({ where: { id: viewer.profileId } })).toMatchObject({ lastDiscoveryActiveOn: active });
    const detail = await request(viewer, "GET", `/api/discovery/profiles/${shared.profileId}`);
    expect(detail.json().value.recommendation).toEqual({ sameArea: true, sameIntention: false, sharedInterests: ["reading", "Music"] });
    expect(JSON.stringify([detail.json(), result.json()])).not.toMatch(/lastDiscoveryActiveOn|rotation|score/);
  });

  it("validates catalog, opaque cursor and query shape and supports newly selected search areas", async () => {
    const other = await published({ publishedAreaId: "other-city", publishedSnapshot: { ...snapshot, areaId: "other-city" } });
    const response = await request(actor, "GET", "/api/discovery/candidates?areaId=other-city");
    expect(response.json().value.items.map((item: { id: string }) => item.id)).toContain(other.profileId);
    expect((await request(actor, "GET", `/api/discovery/profiles/${other.profileId}`)).json().value.recommendation.sameArea).toBe(false);
    for (const query of ["areaId=unknown", "areaId=pilot-city&before=not-a-cursor", "areaId=pilot-city&limit=100", "areaId=pilot-city&before=", "areaId=pilot-city&areaId=other-city"]) expect((await request(actor, "GET", `/api/discovery/candidates?${query}`)).statusCode).toBe(400);
    expect((await request(actor, "GET", "/api/discovery/profiles/not-an-id")).statusCode).toBe(400);
  });

  it("uses normal ID pagination for a city too large to rank in the pilot", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const people = Array.from({ length: 301 }, () => ({ ownerId: `large-city-${randomUUID()}`, id: randomUUID() }));
    const timestamp = new Date();
    const profile = { ...snapshot, areaId: "large-city" };
    await prisma.user.createMany({ data: people.map(({ ownerId }) => ({ id: ownerId, email: `${ownerId}@example.test`, name: "Private name", emailVerified: true })) });
    await prisma.discoveryProfile.createMany({ data: people.map(person => ({
      ...person, draft: { revision: 1, profile }, publishedSnapshot: profile, publishedAreaId: profile.areaId, publishedIntention: profile.intention,
      adultAttestedAt: timestamp, publishedAt: timestamp, publicationConsentedAt: timestamp, publicationConsentVersion: 1, publicationVersion: 1,
    })) });
    process.env.DISCOVERY_AREAS_JSON = JSON.stringify([{ id: "pilot-city", label: "Pilot city" }, { id: "large-city", label: "Large city" }]);
    process.env.DISCOVERY_PILOT_USER_IDS = [...cohort, ...people.map(person => person.ownerId)].join(",");
    const endpoint = "/api/discovery/candidates?areaId=large-city";
    const expected = people.map(person => person.id).sort().reverse();
    const first = await request(actor, "GET", endpoint);
    expect(first.statusCode).toBe(200);
    expect(first.json().value.items.map((item: { id: string }) => item.id)).toEqual(expected.slice(0, 12));
    // A fallback cursor must stay in ID order even if the pool later shrinks below the cap.
    await prisma.discoveryProfile.update({ where: { id: expected.at(-1) }, data: { pausedAt: timestamp } });
    const next = await request(actor, "GET", `${endpoint}&before=${encodeURIComponent(first.json().value.nextCursor)}`);
    expect(next.statusCode).toBe(200);
    expect(next.json().value.items.map((item: { id: string }) => item.id)).toEqual(expected.slice(12, 24));
  });
});
