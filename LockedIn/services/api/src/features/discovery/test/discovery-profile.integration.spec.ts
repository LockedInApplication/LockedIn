import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson, discoveryRequest } from "./discovery.fixtures.js";
import { randomUUID } from "node:crypto";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

export const publicDraft = { publicName: "Public alias", avatarPreset: "sun", bio: "Published bio", intention: "LONG_TERM", interests: ["Walking"], pace: null, areaId: "pilot-city" };

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("explicit discovery profile publication", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let a: Awaited<ReturnType<typeof createPerson>>, b: typeof a;
  let request: ReturnType<typeof discoveryRequest>;
  const oldEnv = { ...process.env };
  beforeAll(async () => {
    server = await (await import("../../../app.js")).buildServer();
    await server.listen({ port: 0, host: "127.0.0.1" });
    a = await createPerson(); b = await createPerson(); request = discoveryRequest(server);
    Object.assign(process.env, { DISCOVERY_ENABLED: "true", DISCOVERY_PILOT_USER_IDS: `${a.id},${b.id}`, DISCOVERY_MODERATOR_USER_IDS: "synthetic-moderator", DISCOVERY_AREAS_JSON: '[{"id":"pilot-city","label":"Pilot city"},{"id":"other-city","label":"Other city"}]' });
  });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });

  it("keeps drafts private and exposes only a deliberately published snapshot", async () => {
    const first = await request(a, "PUT", "/api/discovery/profile", { ...publicDraft, bio: "private draft marker", revision: 0 });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ownerId: a.id, value: { revision: 1, published: null } });
    await request(b, "PUT", "/api/discovery/profile", { ...publicDraft, revision: 0 });
    await request(b, "POST", "/api/discovery/profile/publish", { draftRevision: 1, adultAttested: true });
    expect((await request(b, "GET", "/api/discovery/candidates?areaId=pilot-city")).json().value.items).toEqual([]);
    await request(a, "PUT", "/api/discovery/profile", { ...publicDraft, revision: 1 });
    const published = await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true });
    expect(published.statusCode).toBe(200);
    const id = published.json().value.published.id;
    expect(id).not.toBe(a.id);
    const { prisma } = await import("../../../lib/prisma.js");
    await prisma.privateReflection.create({ data: { ownerId: a.id, text: "private reflection marker" } });
    const relationship = await prisma.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: b.id }] } } });
    const session = await prisma.intentionSession.create({ data: { relationshipId: relationship.id, createdById: a.id } });
    await prisma.intentionResponse.create({ data: { sessionId: session.id, userId: a.id, answers: { private: "legacy answer marker" } } });
    await request(a, "PUT", "/api/discovery/profile", { ...publicDraft, bio: "private draft marker", areaId: "other-city", revision: 2 });
    const candidates = await request(b, "GET", "/api/discovery/candidates?areaId=pilot-city");
    expect(candidates.json()).toEqual({ ownerId: b.id, value: { items: [{ id, ...publicDraft }], nextCursor: null } });
    const profile = await request(b, "GET", `/api/discovery/profiles/${id}`);
    expect(profile.json()).toEqual({ ownerId: b.id, value: { id, ...publicDraft } });
    for (const response of [profile, candidates]) {
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(JSON.stringify(response.json())).not.toMatch(/private draft marker|private reflection marker|PRIVATE AUTH NAME|email|activityEmails|latitude|longitude|legacy answer|ownerId.*ownerId/);
    }
    // Synthetic auth IDs are deliberately not valid public-profile UUIDs.
    expect((await request(b, "GET", `/api/discovery/profiles/${a.id}`)).statusCode).toBe(400);
    const rawAuthId = randomUUID();
    await prisma.user.create({ data: { id: rawAuthId, email: `${rawAuthId}@example.test`, name: "PRIVATE AUTH NAME", emailVerified: true } });
    expect((await request(b, "GET", `/api/discovery/profiles/${rawAuthId}`)).statusCode).toBe(404);
  });

  it("rejects stale saves and publication revisions; pause hides stale cards without publishing a newer draft", async () => {
    expect((await request(a, "PUT", "/api/discovery/profile", { ...publicDraft, revision: 0 })).statusCode).toBe(409);
    expect((await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true })).statusCode).toBe(409);
    const own = await request(a, "GET", "/api/discovery/profile");
    const id = own.json().value.published.id;
    expect(own.json().value.draft.bio).toBe("private draft marker");
    expect((await request(a, "POST", "/api/discovery/profile/visibility", { paused: true })).statusCode).toBe(200);
    expect((await request(b, "GET", `/api/discovery/profiles/${id}`)).statusCode).toBe(404);
    expect((await request(b, "GET", "/api/discovery/candidates?areaId=pilot-city")).json().value.items).toEqual([]);
    await request(a, "POST", "/api/discovery/profile/visibility", { paused: false });
    expect((await request(b, "GET", `/api/discovery/profiles/${id}`)).json().value.bio).toBe("Published bio");
    const competing = await Promise.all(["one", "two"].map(bio => request(b, "PUT", "/api/discovery/profile", { ...publicDraft, bio, revision: 1 })));
    expect(competing.map(response => response.statusCode).sort()).toEqual([200, 409]);
  });

  it.each([
    { email: "forbidden@example.test" }, { photoUrl: "https://tracker.test" }, { latitude: 1 }, { dob: "2000-01-01" },
    { publicName: " " }, { publicName: "x".repeat(61) }, { bio: "x".repeat(501) }, { pace: "x".repeat(241) },
    { avatarPreset: "https://tracker.test" }, { intention: "CASUAL" }, { areaId: "unknown" },
    { interests: ["same", " same "] }, { interests: ["a", "b", "c", "d", "e", "f"] }, { interests: ["x".repeat(31)] },
  ])("rejects malformed or private input %j", async extra => {
    expect((await request(a, "PUT", "/api/discovery/profile", { ...publicDraft, revision: 3, ...extra })).statusCode).toBe(400);
  });

  it("normalizes validated text, rejects unattested publication and allows owner access after rollout stops", async () => {
    const saved = await request(a, "PUT", "/api/discovery/profile", { ...publicDraft, publicName: "  Public   alias  ", bio: "  two\n words  ", interests: [" Long  walks "], pace: "  slow   replies ", revision: 3 });
    expect(saved.json().value.draft).toMatchObject({ publicName: "Public alias", bio: "two words", interests: ["Long walks"], pace: "slow replies" });
    expect((await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 4, adultAttested: false })).statusCode).toBe(400);
    await request(a, "POST", "/api/discovery/profile/visibility", { paused: true });
    const republished = await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 4, adultAttested: true });
    expect(republished.json().value.paused).toBe(true);
    expect((await request(b, "GET", `/api/discovery/profiles/${republished.json().value.published.id}`)).statusCode).toBe(404);
    process.env.DISCOVERY_ENABLED = "false";
    expect((await request(a, "GET", "/api/discovery/profile")).statusCode).toBe(200);
    expect((await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 4, adultAttested: true })).statusCode).toBe(403);
    expect((await request(a, "POST", "/api/discovery/profile/visibility", { paused: true })).statusCode).toBe(200);
  });
});
