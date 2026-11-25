import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson } from "../discovery/test/discovery.fixtures.js";

vi.mock("../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("Behind the Photo", () => {
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  let db: typeof import("../../lib/prisma.js").prisma;
  beforeAll(async () => {
    ({ prisma: db } = await import("../../lib/prisma.js"));
    app = await (await import("../../app.js")).buildServer();
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  type Person = Awaited<ReturnType<typeof createPerson>>;
  const origin = "http://localhost:3001";
  const get = (person: Person, url: string) => app.inject({ url, headers: { cookie: person.cookie } });
  const remove = (person: Person, url: string) => app.inject({ method: "DELETE", url, headers: { cookie: person.cookie, origin, "x-together-owner": person.id } });
  const json = (person: Person, method: "POST" | "PUT", url: string, payload: object) => app.inject({
    method, url, payload, headers: { cookie: person.cookie, origin, "x-together-owner": person.id },
  });
  async function send(person: Person, method: "POST" | "PUT", url: string, fields: Record<string, string>, attachment?: [string, Blob], overrides?: Record<string, string>) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    if (attachment) body.set(attachment[0], attachment[1], "fixture");
    const encoded = new Request("http://localhost", { method, body });
    return app.inject({
      method, url, payload: Buffer.from(await encoded.arrayBuffer()),
      headers: { cookie: person.cookie, origin, "x-together-owner": person.id, "content-type": encoded.headers.get("content-type")!, ...overrides },
    });
  }
  function voice(frames = 160_000) {
    const bytes = new ArrayBuffer(44 + 2 * frames);
    const pcm = new DataView(bytes);
    const tag = (offset: number, value: string) => new Uint8Array(bytes, offset, value.length).set(new TextEncoder().encode(value));
    tag(0, "RIFF"); pcm.setUint32(4, bytes.byteLength - 8, true); tag(8, "WAVEfmt ");
    pcm.setUint32(16, 16, true); pcm.setUint16(20, 1, true); pcm.setUint16(22, 1, true);
    pcm.setUint32(24, 16000, true); pcm.setUint32(28, 32000, true);
    pcm.setUint16(32, 2, true); pcm.setUint16(34, 16, true); tag(36, "data"); pcm.setUint32(40, 2 * frames, true);
    return new Blob([bytes], { type: "audio/wav" });
  }

  it("shares private files and separate notes in an active lock-in, then revokes access", async () => {
    const a = await createPerson(), b = await createPerson(), stranger = await createPerson();
    const space = await db.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: b.id }] } } });
    const path = `/api/journey/relationships/${space.id}/memories`;
    expect((await app.inject({ url: path })).statusCode).toBe(401);
    expect((await get(a, path)).statusCode).toBe(404);
    await db.relationship.update({ where: { id: space.id }, data: { directLockedInAt: new Date() } });
    expect((await get(stranger, path)).statusCode).toBe(404);
    const image = await sharp({ create: { width: 330, height: 220, channels: 3, background: "#875752" } }).png().toBuffer();
    const photo = { id: randomUUID(), title: "Saturday at four" };
    const file: [string, Blob] = ["file", new Blob([new Uint8Array(image)], { type: "image/png" })];
    expect((await send(a, "POST", path, photo, file, { origin: "https://other.example" })).statusCode).toBe(403);
    expect((await send(a, "POST", path, photo, file, { "x-together-owner": b.id })).statusCode).toBe(409);
    expect((await send(stranger, "POST", path, photo, file)).statusCode).toBe(404);
    expect((await send(a, "POST", path, photo, file)).statusCode).toBe(201);
    expect((await send(a, "POST", path, photo, file)).statusCode).toBe(201);
    const picture = `${path}/${photo.id}`;
    const gallery = (await get(b, path)).json();
    expect(gallery).toEqual({ envelopes: [], photos: [{ ...photo, envelopeId: null, yours: false, width: 330, height: 220, createdAt: expect.any(String), pins: [] }] });
    const imageResponse = await get(b, `${picture}/media`);
    expect(imageResponse.statusCode).toBe(200);
    expect(imageResponse.headers["cache-control"]).toBe("private, no-store");
    expect(imageResponse.headers["content-type"]).toBe("image/jpeg");
    expect((await get(stranger, `${picture}/media`)).statusCode).toBe(404);
    expect((await remove(b, picture)).statusCode).toBe(404);

    const pin = { id: randomUUID(), title: "Foam heart", x: "5025", y: "5075" };
    expect((await send(b, "POST", `${picture}/pins`, { ...pin, x: "10001", text: "Wrong location" })).statusCode).toBe(400);
    expect((await send(a, "POST", `${picture}/pins`, { ...pin, text: "We swapped cups." }, ["voice", voice()])).statusCode).toBe(201);
    const pinPath = `${picture}/pins/${pin.id}`;
    expect((await remove(b, `${pinPath}/note/voice`)).statusCode).toBe(404);
    expect((await send(b, "PUT", `${pinPath}/note`, {}, ["voice", voice(160_001)])).statusCode).toBe(413);
    expect((await send(b, "PUT", `${pinPath}/note`, {}, ["voice", new Blob(["not a WAV"], { type: "audio/wav" })])).statusCode).toBe(400);
    const reply = await send(b, "PUT", `${pinPath}/note`, { text: "The foam was already cold." }, ["voice", voice(16000)]);
    expect(reply.statusCode).toBe(200);
    const { id: noteId } = reply.json();
    const latest = (await get(a, path)).json().photos[0].pins[0];
    expect(latest).toMatchObject({ title: pin.title, x: 5025, y: 5075, notes: [
      { yours: true, text: "We swapped cups.", voiceDurationMs: 10000 },
      { yours: false, text: "The foam was already cold.", voiceDurationMs: 1000 },
    ] });
    expect(latest.notes[1]).not.toHaveProperty("voice");
    expect(latest.notes[1]).not.toHaveProperty("authorId");
    const audioPath = `${pinPath}/notes/${noteId}/voice`;
    const audio = await get(a, audioPath);
    expect(audio.statusCode).toBe(200);
    expect(audio.headers["content-type"]).toBe("audio/wav");
    expect(audio.headers["cache-control"]).toBe("private, no-store");
    expect(audio.rawPayload.subarray(0, 4).toString()).toBe("RIFF");
    expect((await get(stranger, audioPath)).statusCode).toBe(404);
    expect((await remove(b, `${pinPath}/note/text`)).statusCode).toBe(200);
    expect((await get(a, audioPath)).statusCode).toBe(200);
    const block = await db.invitationBlock.create({ data: { blockerId: b.id, blockedId: a.id } });
    expect((await get(a, audioPath)).statusCode).toBe(404);
    expect((await get(b, path)).statusCode).toBe(404);
    await db.invitationBlock.delete({ where: { id: block.id } });
    const left = await app.inject({ method: "POST", url: `/api/journey/relationships/${space.id}/leave`, headers: { cookie: a.cookie, origin } });
    expect(left.statusCode).toBe(200);
    expect((await get(b, audioPath)).statusCode).toBe(404);
    expect((await get(b, `${picture}/media`)).statusCode).toBe(404);
  });

  it("requires explicit Discovery lock-in and honors closure of the linked contact", async () => {
    const a = await createPerson(), b = await createPerson();
    const pair = [a.id, b.id].sort();
    const space = await db.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: b.id }] } } });
    const path = `/api/journey/relationships/${space.id}/memories`;
    const source = await db.discoveryConnection.create({ data: {
      userLowId: pair[0]!, userHighId: pair[1]!, inviterId: a.id, relationshipId: space.id,
      state: "PROMOTED", expiresAt: new Date(Date.now() + 60_000),
      questionKey: "support", questionText: "What helps?", hello: "Hello.", senderPublicName: "Sam", senderAvatarPreset: "initials",
    } });
    expect((await get(a, path)).statusCode).toBe(404);
    await db.discoveryConnection.update({ where: { id: source.id }, data: { lockedInAt: new Date() } });
    expect((await get(a, path)).json()).toEqual({ envelopes: [], photos: [] });
    expect((await get(b, path)).statusCode).toBe(200);
    await db.discoveryConnection.update({ where: { id: source.id }, data: { closedAt: new Date() } });
    expect((await get(a, path)).statusCode).toBe(404);
    expect((await get(b, path)).statusCode).toBe(404);
  });

  it("shares one private memory per completed plan, preserves its outing day, and keeps it after undo", async () => {
    const a = await createPerson(), b = await createPerson(), stranger = await createPerson();
    const space = await db.relationship.create({ data: {
      directLockedInAt: new Date(), members: { create: [{ userId: a.id }, { userId: b.id }] },
    } });
    const other = await db.relationship.create({ data: { directLockedInAt: new Date() } });
    const day = new Date("2026-11-15T00:00:00Z");
    const create = (relationshipId: string, status: "ACCEPTED" | "DONE") => db.roadmapPlan.create({
      data: { relationshipId, proposerId: a.id, title: "Go to the garden", day, status },
    });
    const pending = await create(space.id, "ACCEPTED"), foreign = await create(other.id, "DONE");
    const plan = await create(space.id, "DONE");
    const path = `/api/journey/relationships/${space.id}/memories`;
    const bytes = await sharp({ create: { width: 120, height: 90, channels: 3, background: "#875752" } }).png().toBuffer();
    const file: [string, Blob] = ["file", new Blob([new Uint8Array(bytes)], { type: "image/png" })];
    const upload = (person: Person, sourcePlanId: string, id = randomUUID()) =>
      send(person, "POST", path, { id, title: "Our garden walk", sourcePlanId }, file);
    expect((await upload(stranger, plan.id)).statusCode).toBe(404);
    expect((await upload(a, foreign.id)).statusCode).toBe(404);
    expect((await upload(a, pending.id)).statusCode).toBe(409);
    expect(await db.togetherPhoto.count({ where: { relationshipId: space.id } })).toBe(0);

    const saved = await Promise.all([upload(a, plan.id), upload(b, plan.id)]);
    expect(saved.map(reply => reply.statusCode).sort()).toEqual([200, 201]);
    const id = saved[0]!.json().id;
    expect(saved[1]!.json().id).toBe(id);
    expect(saved.find(reply => reply.statusCode === 200)?.json()).toEqual({ id, existing: true });
    expect((await get(b, path)).json().photos).toEqual([expect.objectContaining({
      id, sourcePlanId: plan.id, day: "2026-11-15", title: "Our garden walk", envelopeId: null,
    })]);
    const memoryStatus = async (person: Person) => (await get(person, "/api/journey/overview")).json().simplePlans
      .find((item: { id: string }) => item.id === plan.id);
    expect(await memoryStatus(a)).toMatchObject({ hasMemory: true, status: "DONE" });
    expect(await memoryStatus(b)).toMatchObject({ hasMemory: true, status: "DONE" });
    const original = await db.togetherPhoto.findUniqueOrThrow({ where: { id }, select: { uploaderId: true } });
    const otherPerson = original.uploaderId === a.id ? b : a;
    const author = original.uploaderId === a.id ? a : b;
    const pin = { id: randomUUID(), title: "First look", x: "5000", y: "5000", text: "We stopped at the same spot." };
    expect((await send(otherPerson, "POST", `${path}/${id}/pins`, pin)).statusCode).toBe(201);
    expect((await send(author, "PUT", `${path}/${id}/pins/${pin.id}/note`, {}, ["voice", voice(16000)])).statusCode).toBe(200);

    const undo = await app.inject({
      method: "POST", url: `/api/journey/relationships/${space.id}/plans/${plan.id}`,
      headers: { cookie: b.cookie, origin, "x-roadmap-owner": b.id },
      payload: { action: "undo-done", requestId: randomUUID(), version: plan.version },
    });
    expect(undo.statusCode).toBe(200);
    expect(await memoryStatus(a)).toMatchObject({ hasMemory: true, status: "ACCEPTED" });
    expect((await get(b, `${path}/${id}/media`)).statusCode).toBe(200);
    expect((await remove(author, `${path}/${id}`)).statusCode).toBe(200);
    expect(await memoryStatus(b)).not.toHaveProperty("hasMemory");
    expect((await upload(b, plan.id)).statusCode).toBe(409);
  });

  it("files private photos without recreating them and gives each caption its own author", async () => {
    const a = await createPerson(), b = await createPerson(), c = await createPerson(), d = await createPerson();
    const makeSpace = (first: Person, second: Person, locked = true) => db.relationship.create({ data: {
      directLockedInAt: locked ? new Date() : null, members: { create: [{ userId: first.id }, { userId: second.id }] },
    } });
    const space = await makeSpace(a, b, false);
    const other = await makeSpace(c, d);
    const path = "/api/journey/relationships/" + space.id + "/memories";
    const otherPath = "/api/journey/relationships/" + other.id + "/memories";
    const env = { id: randomUUID(), title: "The long way home", day: "2026-11-14", tone: "CLAY" };
    const second = { ...env, id: randomUUID(), title: "Slow Sunday" };
    const foreign = { ...env, id: randomUUID() };
    const envPath = path + "/envelopes/" + env.id;
    const folder = { title: env.title, day: env.day, tone: "OLIVE" };
    const caption = envPath + "/caption";
    expect((await json(a, "POST", path + "/envelopes", env)).statusCode).toBe(404);
    await db.relationship.update({ where: { id: space.id }, data: { directLockedInAt: new Date() } });
    expect((await json(a, "POST", path + "/envelopes", { ...env, day: "2026-02-30" })).statusCode).toBe(400);
    expect((await json(a, "POST", path + "/envelopes", env)).statusCode).toBe(201);
    expect((await json(a, "POST", path + "/envelopes", env)).json()).toEqual({ id: env.id });
    expect((await json(b, "POST", path + "/envelopes", second)).statusCode).toBe(201);
    expect((await json(c, "POST", otherPath + "/envelopes", foreign)).statusCode).toBe(201);
    const bytes = await sharp({ create: { width: 700, height: 500, channels: 3, background: "#875752" } }).png().toBuffer();
    const file: [string, Blob] = ["file", new Blob([new Uint8Array(bytes)], { type: "image/png" })];
    const photo = { id: randomUUID(), title: "The platform" };
    const picture = path + "/" + photo.id;
    expect((await send(a, "POST", path, { ...photo, envelopeId: foreign.id }, file)).statusCode).toBe(404);
    expect((await send(a, "POST", path, photo, file)).statusCode).toBe(201);
    const pin = { id: randomUUID(), title: "The lamp", x: "3000", y: "4000", text: "The rain had just stopped." };
    expect((await send(a, "POST", picture + "/pins", pin, ["voice", voice(16000)])).statusCode).toBe(201);
    const before = (await get(a, path)).json().photos[0];
    const clipPath = picture + "/pins/" + pin.id + "/notes/" + before.pins[0].notes[0].id + "/voice";
    const clip = await get(a, clipPath);
    expect(clip.statusCode).toBe(200);
    const thumb = await get(b, picture + "/thumbnail");
    expect(thumb.headers["cache-control"]).toBe("private, no-store");
    expect((await sharp(thumb.rawPayload).metadata()).width).toBe(360);
    expect((await get(c, picture + "/thumbnail")).statusCode).toBe(404);
    expect((await get(c, path)).statusCode).toBe(404);
    expect((await json(c, "PUT", caption, { text: "A stranger" })).statusCode).toBe(404);
    expect((await json(b, "PUT", envPath, { ...folder, coverPhotoId: photo.id })).statusCode).toBe(409);
    const filePhotos = (photoIds: string[], fromEnvelopeId: string | null, envelopeId: string | null) =>
      json(b, "PUT", path + "/filing", { photoIds, fromEnvelopeId, envelopeId });
    expect((await filePhotos([photo.id, randomUUID()], null, env.id)).statusCode).toBe(404);
    expect((await filePhotos([photo.id], null, foreign.id)).statusCode).toBe(404);
    expect((await get(a, path)).json().photos[0].envelopeId).toBeNull();
    expect((await filePhotos([photo.id], null, env.id)).statusCode).toBe(200);
    expect((await filePhotos([photo.id], null, env.id)).statusCode).toBe(200);
    expect((await filePhotos([photo.id], null, second.id)).statusCode).toBe(409);
    expect((await json(b, "PUT", envPath, { ...folder, coverPhotoId: photo.id })).statusCode).toBe(200);
    expect((await get(a, path)).json().photos[0]).toEqual({ ...before, envelopeId: env.id });
    expect((await get(b, clipPath)).rawPayload).toEqual(clip.rawPayload);

    expect((await json(a, "PUT", caption, { text: "I thought we were lost." })).statusCode).toBe(200);
    expect((await json(b, "PUT", caption, { text: "I was hoping we’d get lost.", authorId: a.id })).statusCode).toBe(400);
    expect((await json(b, "PUT", caption, { text: "I was hoping we’d get lost." })).statusCode).toBe(200);
    const bookmarks = async (viewer: Person) => (await get(viewer, path)).json().envelopes.find((item: { id: string }) => item.id === env.id);
    expect(await bookmarks(b)).toMatchObject({ ...folder, coverPhotoId: photo.id, captions: expect.arrayContaining([
      { yours: false, text: "I thought we were lost." }, { yours: true, text: "I was hoping we’d get lost." },
    ]) });
    expect((await remove(b, envPath)).statusCode).toBe(409);
    expect((await remove(a, caption)).statusCode).toBe(200);
    expect((await bookmarks(b)).captions).toEqual([{ yours: true, text: "I was hoping we’d get lost." }]);
    expect((await remove(b, caption)).statusCode).toBe(200);

    expect((await filePhotos([photo.id], env.id, null)).statusCode).toBe(200);
    expect((await bookmarks(a)).coverPhotoId).toBeNull();
    expect((await filePhotos([photo.id], null, env.id)).statusCode).toBe(200);
    const uploadedInside = { id: randomUUID(), title: "Coffee", envelopeId: env.id };
    expect((await send(b, "POST", path, uploadedInside, file)).statusCode).toBe(201);
    expect((await get(a, path)).json().photos).toEqual(expect.arrayContaining([expect.objectContaining(uploadedInside)]));
    expect((await remove(b, envPath)).statusCode).toBe(200);
    const { photos } = (await get(a, path)).json();
    expect(photos).toEqual(expect.arrayContaining([before, expect.objectContaining({ ...uploadedInside, envelopeId: null })]));
    expect((await get(b, clipPath)).rawPayload).toEqual(clip.rawPayload);

    const block = await db.invitationBlock.create({ data: { blockerId: a.id, blockedId: b.id } });
    expect((await json(b, "PUT", path + "/envelopes/" + second.id + "/caption", { text: "After blocking" })).statusCode).toBe(404);
    expect((await get(a, path)).statusCode).toBe(404);
    await db.invitationBlock.delete({ where: { id: block.id } });
  });
});
