import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionFixtures, publicDraft } from "./discovery-connection.fixtures.js";

const preferences = "/api/discovery/match-preferences";
const city = "/api/discovery/candidates?areaId=pilot-city";
const distance = "/api/discovery/candidates?mode=distance";
const basic = { birthDate: "1994-06-04", meetGenders: "all", minAge: 18, maxAge: null, revision: null };
const privateFields = /birthDate|meetGenders|meetAllGenders|minAge|maxAge|NONBINARY|1994-06-04/;

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("mutual Discovery eligibility", () => {
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let db: typeof import("../../../lib/prisma.js").prisma;
  const oldEnv = { ...process.env };
  beforeAll(async () => {
    db = (await import("../../../lib/prisma.js")).prisma;
    app = await (await import("../../../app.js")).buildServer();
    await app.listen({ host: "127.0.0.1", port: 0 });
  });
  beforeEach(() => { Object.assign(process.env, { DISCOVERY_MATCH_PREFERENCES_REQUIRED: "true", DISCOVERY_LOCATION_REQUIRED: "false", DISCOVERY_CHAT_ENABLED: "true", DISCOVERY_PHOTOS_ENABLED: "false" }); });
  afterEach(() => { vi.useRealTimers(); });
  afterAll(async () => { process.env = oldEnv; await app?.close(); await db?.$disconnect(); });

  it.each(["city", "metro", "distance"] as const)("filters both ways before a page limit in %s mode", async mode => {
    const f = connectionFixtures(app);
    const viewer = await f.person();
    expect((await f.request(viewer, "GET", "/api/discovery/me")).json().value.matching).toEqual({ required: true, complete: false });
    expect((await f.request(viewer, "GET", city)).statusCode).toBe(403);
    const fitting = await Promise.all(Array.from({ length: 14 }, () => f.person()));
    const oneWay = await Promise.all(Array.from({ length: 3 }, () => f.person()));
    const unset = await f.person();
    const paused = await f.person();
    const paths = mode === "distance" ? distance : city;
    for (const person of [viewer, ...fitting, ...oneWay, unset, paused]) {
      if (mode === "distance") await db.discoveryDistancePreference.create({ data: { profileId: person.profileId, latitude: 40.75, longitude: -73.99, maxDistanceMiles: 10 } });
      if (mode === "metro") await db.discoveryLocationCheck.create({ data: { profileId: person.profileId, areaId: "pilot-city", expiresAt: new Date(Date.now() + 86400000) } });
    }
    if (mode === "metro") Object.assign(process.env, { DISCOVERY_LOCATION_REQUIRED: "true", DISCOVERY_VERIFIED_MARKETS_JSON: '[{"areaId":"pilot-city","latitude":40.75,"longitude":-73.99,"radiusKm":35}]' });
    const getPage = async (cursor?: string) => {
      const reply = await f.request(viewer, "GET", `${paths}${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`);
      expect(reply.statusCode).toBe(200);
      return reply.json().value as { items: { id: string }[]; nextCursor: string | null };
    };
    const allIds = async () => {
      const ids: string[] = [];
      let nextCursor: string | null | undefined;
      for (let page = 0; page < 4; page++) {
        const response = await getPage(nextCursor ?? undefined);
        ids.push(...response.items.map(item => item.id));
        nextCursor = response.nextCursor;
        if (!nextCursor) return ids;
      }
      throw new Error("Discovery did not finish pagination");
    };
    process.env.DISCOVERY_MATCH_PREFERENCES_REQUIRED = "false";
    await db.discoveryProfile.update({ where: { id: paused.profileId }, data: { pausedAt: new Date() } });
    const priorIds = await allIds();
    expect(priorIds).toContain(unset.profileId);
    process.env.DISCOVERY_MATCH_PREFERENCES_REQUIRED = "true";
    const saveViewer = async (meetGenders: string[]) => {
      const revision = (await f.request(viewer, "GET", preferences)).json().value.settings?.revision ?? null;
      return f.request(viewer, "PUT", preferences, { ...basic, gender: "NONBINARY", meetGenders, revision });
    };
    expect((await saveViewer(["WOMAN"])).statusCode).toBe(200);
    for (const person of [...fitting, ...oneWay, paused]) {
      expect((await f.request(person, "PUT", preferences, { ...basic, gender: "WOMAN", meetGenders: oneWay.includes(person) ? ["MAN"] : ["NONBINARY"] })).statusCode).toBe(200);
    }
    const expected = priorIds.filter(id => fitting.some(person => person.profileId === id));
    expect(expected).toHaveLength(14);
    const first = await getPage();
    expect(first.items.map(item => item.id)).toEqual(expected.slice(0, 12));
    expect(first.nextCursor).toBeTruthy();
    expect(JSON.stringify(first)).not.toMatch(privateFields);
    expect(await allIds()).toEqual(expected);
    expect((await saveViewer(["MAN"])).statusCode).toBe(200);
    expect((await f.request(viewer, "GET", `${paths}&before=${encodeURIComponent(first.nextCursor!)}`)).statusCode).toBe(400);
    expect((await getPage()).items).toEqual([]);
  });

  it("agrees on an inclusive leap-day boundary in city, distance and contact decisions", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-28T23:59:59Z"));
    const f = connectionFixtures(app), a = await f.person(), b = await f.person();
    expect((await f.request(a, "PUT", preferences, { ...basic, gender: "MAN", minAge: 30, maxAge: 30 })).statusCode).toBe(200);
    expect((await f.request(b, "PUT", preferences, { ...basic, gender: "WOMAN", birthDate: "1996-02-29" })).statusCode).toBe(200);
    expect((await f.request(a, "GET", city)).json().value.items).toEqual([]);
    await db.discoveryDistancePreference.createMany({ data: [a, b].map(person => ({ profileId: person.profileId, latitude: 40, longitude: -74, maxDistanceMiles: 10 })) });
    expect((await f.request(a, "GET", distance)).json().value.items).toEqual([]);
    expect((await f.send(a, b)).statusCode).toBe(404);
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    expect((await f.request(a, "GET", distance)).json().value.items.map((item: { id: string }) => item.id)).toEqual([b.profileId]);
    await db.discoveryDistancePreference.deleteMany({ where: { profileId: { in: [a.profileId, b.profileId] } } });
    expect((await f.request(a, "GET", city)).json().value.items.map((item: { id: string }) => item.id)).toEqual([b.profileId]);
    expect((await f.send(a, b)).statusCode).toBe(200);
  });

  it("denies stale profile and photo reads but keeps pending safety actions and existing chats", async () => {
    const f = connectionFixtures(app), a = await f.person(), b = await f.person(), c = await f.person(), unset = await f.person();
    const save = async (person: typeof a, patch: object = {}) => {
      const revision = (await f.request(person, "GET", preferences)).json().value.settings?.revision ?? null;
      return f.request(person, "PUT", preferences, { ...basic, gender: "NONBINARY", revision, ...patch });
    };
    for (const person of [a, b, c]) expect((await save(person)).statusCode).toBe(200);
    Object.assign(process.env, { DISCOVERY_PHOTOS_ENABLED: "true", CLOUDINARY_CLOUD_NAME: "synthetic", CLOUDINARY_API_KEY: "synthetic", CLOUDINARY_API_SECRET: "synthetic" });
    const photo = await db.discoveryPhoto.create({ data: { ownerId: b.id, profileId: b.profileId, requestId: randomUUID(), payloadHash: "a".repeat(64), state: "APPROVED", scanCompleted: true, width: 600, height: 800, assetId: randomUUID(), publicId: randomUUID(), assetVersion: 1 } });
    await db.discoveryProfile.update({ where: { id: b.profileId }, data: { publishedSnapshot: { ...publicDraft, photoIds: [photo.id] } } });
    const { getPhotoAccess } = await import("../photos/photo-access.service.js");
    const profile = `/api/discovery/profiles/${b.profileId}`;
    expect((await f.request(a, "GET", profile)).statusCode).toBe(200);
    expect(await getPhotoAccess(a.id, photo.id, "ordinary")).not.toBeNull();
    expect((await save(b, { meetGenders: ["WOMAN"] })).statusCode).toBe(200);
    expect((await f.request(a, "GET", profile)).statusCode).toBe(404);
    expect(await getPhotoAccess(a.id, photo.id, "ordinary")).toBeNull();
    const [stale, missing] = [await f.send(a, b), await f.send(a, unset)];
    expect(stale.statusCode).toBe(404);
    expect(stale.json()).toEqual(missing.json());
    expect((await save(b)).statusCode).toBe(200);
    const old = await f.send(a, c), pending = await f.send(a, b);
    expect(old.statusCode).toBe(200);
    expect(pending.statusCode).toBe(200);
    const acceptedUrl = `/api/discovery/connections/${old.json().value.id}`;
    const pendingId = pending.json().value.id;
    const pendingUrl = `/api/discovery/connections/${pendingId}`;
    expect((await f.request(c, "POST", `${acceptedUrl}/accept`, {})).statusCode).toBe(200);
    expect((await f.request(b, "GET", pendingUrl)).json().value.canAccept).toBe(true);
    expect((await f.request(a, "DELETE", preferences)).statusCode).toBe(200);
    expect((await f.request(b, "GET", pendingUrl)).json().value).toMatchObject({ state: "PENDING", canAccept: false });
    expect((await f.request(b, "POST", `${pendingUrl}/accept`, {})).statusCode).toBe(409);
    expect(await db.chatConversation.findUnique({ where: { discoveryConnectionId: pendingId } })).toBeNull();
    const receipt = await f.request(b, "POST", "/api/discovery/reports", { sourceType: "INVITATION", sourceId: pendingId, reason: "SPAM", requestId: randomUUID() });
    expect(receipt.statusCode).toBe(200);
    const report = await db.discoveryReport.findUniqueOrThrow({ where: { id: receipt.json().value.id } });
    const notices = await db.notification.findMany({ where: { recipientId: { in: [a.id, b.id, c.id] } } });
    expect(JSON.stringify([report.evidence, notices], (_key, value) => typeof value === "bigint" ? value.toString() : value)).not.toMatch(privateFields);
    expect((await f.request(b, "POST", `${pendingUrl}/decline`, {})).json().value.state).toBe("DECLINED");
    expect((await f.request(a, "GET", `${acceptedUrl}/profile`)).statusCode).toBe(200);
    expect((await f.request(a, "POST", `${acceptedUrl}/messages`, { requestId: randomUUID(), text: "Chat still works" })).statusCode).toBe(200);
  });
});
