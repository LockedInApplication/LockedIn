import { Writable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectionFixtures } from "./discovery-connection.fixtures.js";
import { createPerson } from "./discovery.fixtures.js";

const path = "/api/discovery/match-preferences";
const input = { birthDate: "1997-02-08", gender: "NONBINARY", meetGenders: "all", minAge: 18, maxAge: null };
const newSetup = { ...input, revision: null };

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("private Discovery match settings", () => {
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let db: typeof import("../../../lib/prisma.js").prisma;
  let logs = "";
  const oldEnv = { ...process.env };
  beforeAll(async () => {
    db = (await import("../../../lib/prisma.js")).prisma;
    app = await (await import("../../../app.js")).buildServer({ logStream: new Writable({ write(chunk, _encoding, callback) { logs += chunk.toString(); callback(); } }) });
    await app.listen({ host: "127.0.0.1", port: 0 });
  });
  beforeEach(() => { process.env.DISCOVERY_MATCH_PREFERENCES_REQUIRED = "true"; });
  afterAll(async () => { process.env = oldEnv; await app?.close(); await db?.$disconnect(); });

  it("requires valid explicit choices and never logs values in invalid requests", async () => {
    const f = connectionFixtures(app), owner = await f.person();
    for (const patch of [
      { gender: undefined }, { meetGenders: undefined }, { meetGenders: [] }, { meetGenders: ["MAN", "MAN"] },
      { maxAge: undefined }, { minAge: 21 }, { minAge: 35, maxAge: 21 }, { minAge: 17 },
      { birthDate: "2001-02-29" }, { birthDate: "2999-02-19" }, { birthDate: new Date().toISOString().slice(0, 10) },
      { notes: "private-values-should-not-be-logged" },
    ]) expect((await f.request(owner, "PUT", path, { ...newSetup, ...patch })).statusCode).toBe(400);
    expect((await f.request(owner, "GET", path)).json().value.settings).toBeNull();
    expect((await f.request(owner, "GET", `${path}?birthDate=1998-07-04`)).statusCode).toBe(400);
    expect(logs).not.toMatch(/1998-07-04|private-values-should-not-be-logged/);
  });

  it("saves before publication, and never accepts another account or origin", async () => {
    const f = connectionFixtures(app), owner = await createPerson(), other = await f.person();
    process.env.DISCOVERY_PILOT_USER_IDS += `,${owner.id}`;
    expect((await f.request(owner, "GET", path)).json()).toEqual({ ownerId: owner.id, value: { required: true, settings: null } });
    const saved = await f.request(owner, "PUT", path, newSetup);
    expect(saved.statusCode).toBe(200);
    expect(saved.headers["cache-control"]).toBe("private, no-store");
    expect(saved.json().value.settings).toEqual({ ...input, revision: expect.any(String) });
    expect(await db.discoveryProfile.findUnique({ where: { ownerId: owner.id } })).toBeNull();
    expect((await f.request(other, "GET", path)).json().value.settings).toBeNull();
    expect((await f.request(other, "GET", `${path}?ownerId=${owner.id}`)).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: path, headers: { cookie: owner.cookie } })).json().value.settings).toMatchObject(input);
    expect((await app.inject({ method: "GET", url: path, headers: { cookie: other.cookie, origin: "http://localhost:3001", "x-discovery-owner": owner.id } })).statusCode).toBe(409);
    expect((await app.inject({ method: "PUT", url: path, payload: newSetup, headers: { cookie: owner.cookie, origin: "https://example.test", "x-discovery-owner": owner.id } })).statusCode).toBe(403);
    expect(logs).not.toContain(input.birthDate);
  });

  it("does not let removal reset a consumed correction, and prunes the expired timestamp-only guard", async () => {
    const f = connectionFixtures(app), owner = await f.person();
    const save = async (patch: object = {}) => {
      const revision = (await f.request(owner, "GET", path)).json().value.settings?.revision ?? null;
      return f.request(owner, "PUT", path, { ...input, revision, ...patch });
    };
    const clear = () => f.request(owner, "DELETE", path);
    const initial = await save();
    expect(initial.statusCode).toBe(200);
    const changed = { birthDate: "1996-02-08" };
    expect((await save(changed)).statusCode).toBe(409);
    expect((await save({ ...changed, confirmBirthDateChange: true })).statusCode).toBe(200);
    const edit = await save({ ...changed, gender: "WOMAN" });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().value.settings.revision).not.toBe(initial.json().value.settings.revision);
    expect((await save({ confirmBirthDateChange: true })).statusCode).toBe(409);
    expect((await clear()).json().value.settings).toBeNull();
    expect((await f.request(owner, "GET", path)).json().value).toEqual({ required: true, settings: null, requiresBirthDateConfirmation: true });
    expect(await db.discoveryMatchPreferences.findUnique({ where: { ownerId: owner.id } })).toBeNull();
    const guard = await db.discoveryMatchPreferenceGuard.findUniqueOrThrow({ where: { ownerId: owner.id } });
    expect(Object.keys(guard).sort()).toEqual(["correctionUntil", "ownerId", "reenrollUntil"]);
    expect((await save({ confirmBirthDateChange: true })).statusCode).toBe(409);
    await db.discoveryMatchPreferenceGuard.update({ where: { ownerId: owner.id }, data: { correctionUntil: new Date(0), reenrollUntil: new Date(0) } });
    const { pruneDiscoveryMatchPreferenceGuards } = await import("../discovery-match-preferences.service.js");
    await pruneDiscoveryMatchPreferenceGuards(db, new Date());
    expect(await db.discoveryMatchPreferenceGuard.findUnique({ where: { ownerId: owner.id } })).toBeNull();
    expect((await save()).statusCode).toBe(200);
    await clear();
    await db.user.delete({ where: { id: owner.id } });
    expect(await db.discoveryMatchPreferenceGuard.findUnique({ where: { ownerId: owner.id } })).toBeNull();
  });

  it("allows removal after suspension, leaving the pilot and turning matching off", async () => {
    const f = connectionFixtures(app), owner = await f.person();
    expect((await f.request(owner, "PUT", path, newSetup)).statusCode).toBe(200);
    await db.discoveryProfile.update({ where: { id: owner.profileId }, data: { pausedAt: new Date(), suspendedAt: new Date() } });
    process.env.DISCOVERY_PILOT_USER_IDS = "";
    process.env.DISCOVERY_MATCH_PREFERENCES_REQUIRED = "false";
    expect((await f.request(owner, "GET", path)).json().value.settings).toMatchObject(input);
    expect((await f.request(owner, "DELETE", path)).json().value).toEqual({ required: false, settings: null });
    expect((await f.request(owner, "PUT", path, newSetup)).statusCode).toBe(404);
    expect(await db.discoveryMatchPreferences.findUnique({ where: { ownerId: owner.id } })).toBeNull();
  });

  it("does not let a stale editor widen saved preferences or recreate a removed setup", async () => {
    const f = connectionFixtures(app), owner = await f.person();
    const first = await f.request(owner, "PUT", path, { ...input, revision: null });
    expect(first.statusCode).toBe(200);
    const old = first.json().value.settings.revision;
    const narrowed = await f.request(owner, "PUT", path, { ...input, meetGenders: ["WOMAN"], revision: old });
    expect(narrowed.statusCode).toBe(200);
    const stale = await f.request(owner, "PUT", path, { ...input, minAge: 23, maxAge: 44, revision: old });
    expect(stale.statusCode).toBe(409);
    expect((await f.request(owner, "GET", path)).json().value.settings).toMatchObject({ meetGenders: ["WOMAN"], minAge: 18, maxAge: null });
    await f.request(owner, "DELETE", path);
    expect((await f.request(owner, "PUT", path, { ...input, confirmBirthDateChange: true, revision: narrowed.json().value.settings.revision })).statusCode).toBe(409);
    expect((await f.request(owner, "GET", path)).json().value.settings).toBeNull();
  });
});
