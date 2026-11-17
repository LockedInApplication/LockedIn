import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionFixtures, publicDraft } from "./discovery-connection.fixtures.js";
import { createPerson } from "./discovery.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("explicit open Discovery admission", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let f: ReturnType<typeof connectionFixtures>;
  const env = { ...process.env };
  const city = "/api/discovery/candidates?areaId=pilot-city";
  const open = () => Object.assign(process.env, { DISCOVERY_ACCESS_MODE: "open", DISCOVERY_PILOT_USER_IDS: "" });
  beforeAll(async () => {
    server = await (await import("../../../app.js")).buildServer();
    await server.listen({ host: "127.0.0.1", port: 0 });
    f = connectionFixtures(server);
  });
  beforeEach(() => { process.env = { ...env }; f.configure(); });
  afterAll(async () => { process.env = env; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });

  it("admits non-pilot accounts without publishing them and requires deliberate publication", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const { getDiscoveryCapabilities } = await import("../discovery.policy.js");
    const viewer = await f.person(), newcomer = await createPerson();
    // Other integration files seed the same disposable database concurrently.
    // Give the admission case its own city; first-page membership is otherwise
    // random once other suites contribute more than twelve eligible profiles.
    process.env.DISCOVERY_AREAS_JSON = '[{"id":"pilot-city","label":"Pilot city"},{"id":"open-admission-city","label":"Open admission city"}]';
    const localDraft = { ...publicDraft, areaId: "open-admission-city" };
    expect((await f.request(newcomer, "PUT", "/api/discovery/profile", { ...localDraft, revision: 0 })).statusCode).toBe(403);
    open();
    expect(await getDiscoveryCapabilities({ userId: newcomer.id, emailVerified: true })).toMatchObject({ canDiscover: true, canModerate: false });
    expect((await f.request(newcomer, "PUT", "/api/discovery/profile", { ...localDraft, revision: 0 })).statusCode).toBe(200);
    const draft = await prisma.discoveryProfile.findUniqueOrThrow({ where: { ownerId: newcomer.id } });
    expect(draft.publishedAt).toBeNull();
    expect((await f.request(viewer, "GET", `/api/discovery/profiles/${draft.id}`)).statusCode).toBe(404);
    expect((await f.request(newcomer, "POST", "/api/discovery/profile/publish", { draftRevision: 1, adultAttested: false })).statusCode).toBe(400);
    expect((await f.request(newcomer, "POST", "/api/discovery/profile/publish", { draftRevision: 1, adultAttested: true })).statusCode).toBe(200);
    expect((await f.request(viewer, "GET", `/api/discovery/profiles/${draft.id}`)).statusCode).toBe(200);
    expect((await f.request(viewer, "GET", "/api/discovery/candidates?areaId=open-admission-city")).json().value.items.map((p: { id: string }) => p.id)).toContain(draft.id);
    expect((await f.send(viewer, { profileId: draft.id })).statusCode).toBe(200);
  });

  it("retains verification, consent, suspension, pause, blocks, moderators, and the kill switch", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const viewer = await f.person(), target = await f.person();
    open();
    expect((await f.request(viewer, "GET", `/api/discovery/profiles/${target.profileId}`)).statusCode).toBe(200);
    for (const patch of [{ pausedAt: new Date() }, { suspendedAt: new Date() }, { publicationConsentedAt: null }, { adultAttestedAt: null }]) {
      const original = await prisma.discoveryProfile.findUniqueOrThrow({ where: { id: target.profileId } });
      await prisma.discoveryProfile.update({ where: { id: target.profileId }, data: patch });
      expect((await f.request(viewer, "GET", `/api/discovery/profiles/${target.profileId}`)).statusCode).toBe(404);
      expect((await f.send(viewer, target)).statusCode).toBe(404);
      await prisma.discoveryProfile.update({ where: { id: target.profileId }, data: { pausedAt: original.pausedAt, suspendedAt: original.suspendedAt, publicationConsentedAt: original.publicationConsentedAt, adultAttestedAt: original.adultAttestedAt } });
    }
    await prisma.invitationBlock.create({ data: { blockerId: target.id, blockedId: viewer.id } });
    expect((await f.send(viewer, target)).statusCode).toBe(404);
    await prisma.user.update({ where: { id: viewer.id }, data: { emailVerified: false } });
    expect((await f.request(viewer, "GET", city)).statusCode).toBe(403);
    await prisma.user.update({ where: { id: viewer.id }, data: { emailVerified: true } });
    await prisma.discoveryProfile.update({ where: { id: viewer.profileId }, data: { suspendedAt: new Date() } });
    expect((await f.request(viewer, "GET", city)).statusCode).toBe(403);
    await prisma.discoveryProfile.update({ where: { id: viewer.profileId }, data: { suspendedAt: null } });
    for (const patch of [{ DISCOVERY_ACCESS_MODE: "typo" }, { DISCOVERY_MODERATOR_USER_IDS: "" }, { DISCOVERY_ENABLED: "false" }]) {
      const current = { ...process.env }; Object.assign(process.env, patch);
      expect((await f.request(viewer, "GET", city)).statusCode).toBe(403);
      process.env = current;
    }
  });

  it("invalidates cursors across access modes and cohort/catalog changes without losing history", async () => {
    const viewer = await f.person();
    await Promise.all(Array.from({ length: 14 }, () => f.person()));
    open();
    const first = await f.request(viewer, "GET", city);
    expect(first.statusCode).toBe(200);
    const next = `${city}&before=${encodeURIComponent(first.json().value.nextCursor)}`;
    expect((await f.request(viewer, "GET", next)).statusCode).toBe(200);
    process.env.DISCOVERY_ACCESS_MODE = "pilot"; f.configure();
    expect((await f.request(viewer, "GET", next)).statusCode).toBe(400);
    const pilot = await f.request(viewer, "GET", city);
    process.env.DISCOVERY_PILOT_USER_IDS += ",new-pilot";
    expect((await f.request(viewer, "GET", `${city}&before=${encodeURIComponent(pilot.json().value.nextCursor)}`)).statusCode).toBe(400);
    open();
    process.env.DISCOVERY_AREAS_JSON = '[{"id":"pilot-city","label":"Pilot city"},{"id":"other-city","label":"Other city"}]';
    expect((await f.request(viewer, "GET", next)).statusCode).toBe(400);
    process.env.DISCOVERY_ACCESS_MODE = "pilot"; process.env.DISCOVERY_PILOT_USER_IDS = "";
    expect((await f.request(viewer, "GET", city)).statusCode).toBe(403);
    expect((await f.request(viewer, "GET", "/api/discovery/profile")).statusCode).toBe(200);
  });
});
